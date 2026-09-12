import { projectOntoWall, wallLengthMm, type Vec2 } from './walls';
import type { Room, ServicePoint, ServicePointKind } from './schema';

/**
 * Инженерные точки: розетки, вода, слив, вентиляция, газ.
 *
 * Половина переделок на монтаже — из-за них. Мойку нельзя поставить
 * вдали от стояка, вытяжку — вдали от канала, посудомойке нужны сразу
 * вода, слив и розетка. Планировщик, который о них молчит, рисует
 * кухню, которую нельзя подключить.
 */

export interface ServiceKindInfo {
  kind: ServicePointKind;
  name: string;
  /** Высота от пола по умолчанию */
  heightMm: number;
  /** Цвет метки: он же на плане и в сцене */
  colour: string;
  short: string;
}

/**
 * Ряд высот из практики: розетка над столешницей на 1100–1150, вывод
 * воды под мойкой на 500, вентканал под потолком.
 */
export const SERVICE_KINDS: readonly ServiceKindInfo[] = [
  { kind: 'socket', name: 'Розетка', heightMm: 1150, colour: '#2f6fed', short: 'Р' },
  { kind: 'switch', name: 'Выключатель', heightMm: 900, colour: '#5b6bd6', short: 'В' },
  { kind: 'water', name: 'Вода', heightMm: 500, colour: '#1f9bd1', short: 'Ⓥ' },
  { kind: 'drain', name: 'Слив', heightMm: 350, colour: '#7a8794', short: 'С' },
  { kind: 'vent', name: 'Вентиляция', heightMm: 2100, colour: '#3aa76d', short: 'Вент' },
  { kind: 'gas', name: 'Газ', heightMm: 800, colour: '#e0a021', short: 'Г' },
];

export function serviceInfo(kind: ServicePointKind): ServiceKindInfo {
  return SERVICE_KINDS.find((item) => item.kind === kind) ?? SERVICE_KINDS[0]!;
}

/**
 * Точка, прижатая к ближайшей стене.
 *
 * Инженерия живёт на стенах: розетка посреди комнаты бывает только в
 * полу, и такую ставят отдельно. Привязка к стене нужна и плану — на
 * нём метка рисуется на стене, а не рядом с ней.
 */
export function snapToWall(
  room: Room,
  point: Vec2,
  toleranceMm = 900,
): { position: Vec2; wallId: string | null } {
  let best: { position: Vec2; wallId: string; distanceMm: number } | null = null;

  for (const wall of room.walls) {
    const projection = projectOntoWall(wall, point);
    if (best && projection.distanceMm >= best.distanceMm) continue;
    if (wallLengthMm(wall) <= 0) continue;

    best = { position: projection.point, wallId: wall.id, distanceMm: projection.distanceMm };
  }

  if (!best || best.distanceMm > toleranceMm) return { position: point, wallId: null };
  return { position: best.position, wallId: best.wallId };
}

/** Точки заданного вида. */
export function servicesOfKind(
  services: readonly ServicePoint[],
  kind: ServicePointKind,
): ServicePoint[] {
  return services.filter((service) => service.kind === kind);
}

/** Расстояние в плане от точки до ближайшей инженерной точки нужного вида. */
export function nearestServiceMm(
  services: readonly ServicePoint[],
  kind: ServicePointKind,
  from: Vec2,
): number | null {
  const candidates = servicesOfKind(services, kind);
  if (candidates.length === 0) return null;

  return Math.min(
    ...candidates.map((service) =>
      Math.hypot(service.position.x - from.x, service.position.y - from.y),
    ),
  );
}
