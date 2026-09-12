import type { Opening, Room, Wall } from './schema';
import { innerNormal, pointAlongWall, wallDirection, wallLengthMm, type Vec2 } from './walls';
import type { Box } from './collision';

/**
 * Зоны открывания дверей.
 *
 * Дверь занимает место не только в проёме: распахнутое полотно выметает
 * четверть круга в помещении, и мебель, поставленную туда, дверь просто
 * не пропустит. Планировщик, который об этом молчит, выдаёт кухню,
 * собрать которую нельзя.
 *
 * Чистая математика на миллиметрах: ни Three.js, ни DOM. По этим же
 * данным вьюер рисует дугу на полу, поэтому подсвеченная зона и зона,
 * по которой считается конфликт, совпадают по определению.
 */

/** Четверть круга: полотно распахивается ровно на 90°. */
const SWEEP = Math.PI / 2;

/** Сколько точек берётся с дуги при проверке пересечения. */
const ARC_SAMPLES = 12;

export interface SwingZone {
  openingId: string;
  wallId: string;
  /** Точка навески: вокруг неё вращается полотно */
  hinge: Vec2;
  /** Длина полотна */
  radiusMm: number;
  /** Угол закрытого положения (полотно в плоскости стены), радианы */
  closedAngle: number;
  /** Угол распахнутого положения, радианы */
  openAngle: number;
  /** Низ и верх полотна от уровня пола */
  bottomMm: number;
  topMm: number;
}

/**
 * Зона открывания одного проёма.
 *
 * Возвращает null там, где выметать нечего: у окна, арки и ниши полотна
 * нет, а у двери с явно обнулённым радиусом зона отключена вручную.
 */
export function swingZone(room: Pick<Room, 'walls'>, opening: Opening): SwingZone | null {
  if (opening.kind !== 'door') return null;

  const radiusMm = opening.swingRadius ?? opening.width;
  if (radiusMm <= 0) return null;

  const wall = room.walls.find((candidate) => candidate.id === opening.wallId);
  if (!wall) return null;

  const length = wallLengthMm(wall);
  const from = Math.max(0, Math.min(length, opening.offset));
  const to = Math.max(0, Math.min(length, opening.offset + opening.width));
  if (to <= from) return null;

  // Петли слева — считая от начала стены; полотно закрыто в сторону
  // противоположного откоса
  const hingeAt = opening.hinge === 'left' ? from : to;
  const direction = wallDirection(wall);
  const towardsJamb = opening.hinge === 'left' ? 1 : -1;

  const normal = innerNormal(room as Pick<Room, 'walls'>, wall);
  // Наружу открывается дверь на улицу; внутрь — межкомнатная
  const side = opening.swingInward ? 1 : -1;

  return {
    openingId: opening.id,
    wallId: wall.id,
    hinge: pointAlongWall(wall, hingeAt),
    radiusMm,
    closedAngle: Math.atan2(direction.y * towardsJamb, direction.x * towardsJamb),
    openAngle: Math.atan2(normal.y * side, normal.x * side),
    bottomMm: opening.sillHeight,
    topMm: opening.sillHeight + opening.height,
  };
}

/** Зоны открывания всех дверей помещения. */
export function swingZones(room: Room): SwingZone[] {
  return room.openings
    .map((opening) => swingZone(room, opening))
    .filter((zone): zone is SwingZone => zone !== null);
}

/**
 * Точки дуги от закрытого положения к распахнутому.
 *
 * Обход идёт по кратчайшей дуге: между плоскостью стены и нормалью
 * ровно 90°, и разворот в другую сторону означал бы, что дверь
 * открывается сквозь стену.
 */
export function swingArc(zone: SwingZone, samples = ARC_SAMPLES): Vec2[] {
  const delta = shortestTurn(zone.closedAngle, zone.openAngle);
  const points: Vec2[] = [];

  for (let i = 0; i <= samples; i++) {
    const angle = zone.closedAngle + (delta * i) / samples;
    points.push({
      x: zone.hinge.x + Math.cos(angle) * zone.radiusMm,
      y: zone.hinge.y + Math.sin(angle) * zone.radiusMm,
    });
  }
  return points;
}

/** Кратчайший поворот от одного угла к другому, радианы со знаком. */
function shortestTurn(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  // Между стеной и её нормалью всегда прямой угол: больший разворот
  // означал бы, что дверь идёт сквозь кладку
  return Math.sign(delta) * Math.min(Math.abs(delta), SWEEP);
}

/** Лежит ли точка внутри сектора. */
export function insideSwing(zone: SwingZone, point: Vec2): boolean {
  const dx = point.x - zone.hinge.x;
  const dy = point.y - zone.hinge.y;
  const distance = Math.hypot(dx, dy);
  if (distance > zone.radiusMm) return false;
  if (distance === 0) return true;

  const delta = shortestTurn(zone.closedAngle, zone.openAngle);
  const offset = shortestTurn(zone.closedAngle, Math.atan2(dy, dx));
  // Знак совпадает с направлением разворота, величина не больше сектора
  return delta >= 0 ? offset >= 0 && offset <= delta : offset <= 0 && offset >= delta;
}

/**
 * Перекрывает ли габарит зону открывания.
 *
 * Проверка приблизительная и намеренно грубая в пользу пользователя:
 * сектор берётся точками дуги, габарит — углами. Точное пересечение
 * сектора с повёрнутым прямоугольником стоило бы заметно дороже, а
 * ошибка на миллиметры здесь ничего не меняет: подсказка говорит
 * «сюда дверь не пустит», а не считает зазор.
 */
export function swingBlocked(zone: SwingZone, box: Box): boolean {
  // Полотно выметает объём, а не плоскость: тумба под подоконником
  // двери не мешает, если полотно проходит выше неё
  if (box.topMm <= zone.bottomMm || box.bottomMm >= zone.topMm) return false;

  for (const corner of boxCorners(box)) {
    if (insideSwing(zone, corner)) return true;
  }

  // Габарит может быть настолько крупным, что все его углы вне сектора,
  // а сам сектор целиком внутри него
  const probes = [zone.hinge, ...swingArc(zone)];
  return probes.some((point) => insideBox(box, point));
}

/** Идентификаторы проёмов, открыванию которых мешает габарит. */
export function blockedSwings(zones: readonly SwingZone[], box: Box): string[] {
  return zones.filter((zone) => swingBlocked(zone, box)).map((zone) => zone.openingId);
}

/** Углы габарита в плане с учётом поворота. */
function boxCorners(box: Box): Vec2[] {
  const angle = (box.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return [
    [-box.halfWidthMm, -box.halfDepthMm],
    [box.halfWidthMm, -box.halfDepthMm],
    [box.halfWidthMm, box.halfDepthMm],
    [-box.halfWidthMm, box.halfDepthMm],
  ].map(([x, z]) => ({
    x: box.centre.x + x! * cos - z! * sin,
    y: box.centre.y + x! * sin + z! * cos,
  }));
}

/** Лежит ли точка плана внутри габарита. */
function insideBox(box: Box, point: Vec2): boolean {
  const angle = (box.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - box.centre.x;
  const dz = point.y - box.centre.y;

  // Поворот в локальные оси габарита: там проверка сводится к сравнению
  const localX = dx * cos + dz * sin;
  const localZ = -dx * sin + dz * cos;
  return Math.abs(localX) <= box.halfWidthMm && Math.abs(localZ) <= box.halfDepthMm;
}
