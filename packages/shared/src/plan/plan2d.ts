import { boxAxes, boxCorners, placementBox } from '../scene/collision';
import { placementProductSize } from '../scene/resize';
import { roomDimensions, type WallDimension } from '../scene/dimensions';
import { swingArc, swingZones } from '../scene/swing';
import { pointAlongWall, wallLengthMm, wallNormal, type Vec2 } from '../scene/walls';
import { serviceInfo } from '../scene/services';
import type { CatalogProduct } from '../catalog/schema';
import type { SceneDoc, ServicePoint } from '../scene/schema';

/**
 * План сверху для замерщика и монтажника.
 *
 * По 3D не монтируют: на объект приходят с планом, где есть размеры,
 * привязки и отметки инженерии. План считается из того же документа,
 * что и сцена, поэтому разойтись они не могут.
 *
 * Здесь только геометрия в миллиметрах — рисование остаётся за вьюером
 * или страницей. Так план одинаково ложится и в SVG на экране, и в PDF
 * на сервере.
 */

/** Отступ размерной линии наружу от стены. */
export const PLAN_DIMENSION_OFFSET_MM = 520;

export interface PlanWall {
  id: string;
  /** Четыре угла стены в плане */
  corners: Vec2[];
}

export interface PlanOpening {
  id: string;
  kind: string;
  /** Проём в плане: прямоугольник по толщине стены */
  corners: Vec2[];
  /** Дуга открывания двери; пусто у окна */
  arc: Vec2[];
  widthMm: number;
}

export interface PlanItem {
  instanceId: string;
  sku: string;
  name: string;
  role: CatalogProduct['role'];
  /**
   * Куда сдвинута подпись от центра.
   *
   * Навесной модуль стоит ровно над нижним, и подписи в одной точке
   * наложились бы. Верхняя уходит к стене, нижняя — в комнату.
   */
  labelAt: Vec2;
  /** Габарит в плане с учётом поворота */
  corners: Vec2[];
  centre: Vec2;
  widthMm: number;
  depthMm: number;
  /** Навесной модуль рисуется пунктиром: он над рабочей зоной */
  mounted: boolean;
}

export interface PlanService {
  id: string;
  kind: string;
  name: string;
  short: string;
  colour: string;
  position: Vec2;
  heightMm: number;
}

export interface PlanGeometry {
  walls: PlanWall[];
  openings: PlanOpening[];
  items: PlanItem[];
  services: PlanService[];
  dimensions: WallDimension[];
  /** Габарит плана с полями, миллиметры */
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /** Площадь помещения по внутренним поверхностям, м² */
  areaSqm: number;
}

/** Прямоугольник стены в плане: осевая линия, разведённая на толщину. */
function wallCorners(wall: {
  start: Vec2;
  end: Vec2;
  thickness: number;
}): Vec2[] {
  const normal = wallNormal(wall);
  const half = wall.thickness / 2;

  return [
    { x: wall.start.x + normal.x * half, y: wall.start.y + normal.y * half },
    { x: wall.end.x + normal.x * half, y: wall.end.y + normal.y * half },
    { x: wall.end.x - normal.x * half, y: wall.end.y - normal.y * half },
    { x: wall.start.x - normal.x * half, y: wall.start.y - normal.y * half },
  ];
}

/** Площадь по формуле шнурования, м². */
function areaOf(points: readonly Vec2[]): number {
  if (points.length < 3) return 0;

  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum / 2) / 1_000_000;
}

/**
 * Геометрия плана.
 *
 * Навесные модули помечаются отдельно: на плане их рисуют пунктиром,
 * иначе верхний ряд читается как второй нижний.
 */
export function planGeometry(
  doc: SceneDoc,
  products: ReadonlyMap<string, CatalogProduct>,
): PlanGeometry {
  const walls: PlanWall[] = [];
  const openings: PlanOpening[] = [];
  const dimensions: WallDimension[] = [];
  let areaSqm = 0;

  for (const room of doc.rooms) {
    for (const wall of room.walls) walls.push({ id: wall.id, corners: wallCorners(wall) });
    // Размеры выносятся НАРУЖУ помещения: внутри они ложатся на мебель
    // и план перестаёт читаться. Отрицательный отступ уводит линию за
    // внешнюю поверхность стены
    dimensions.push(...roomDimensions(room, -PLAN_DIMENSION_OFFSET_MM));
    areaSqm += areaOf(room.walls.map((wall) => wall.start));

    const zones = new Map(swingZones(room).map((zone) => [zone.openingId, zone]));

    for (const opening of room.openings) {
      const wall = room.walls.find((candidate) => candidate.id === opening.wallId);
      if (!wall) continue;

      const length = wallLengthMm(wall);
      const from = Math.max(0, Math.min(length, opening.offset));
      const to = Math.max(0, Math.min(length, opening.offset + opening.width));
      if (to <= from) continue;

      const normal = wallNormal(wall);
      const half = wall.thickness / 2;
      const a = pointAlongWall(wall, from);
      const b = pointAlongWall(wall, to);
      const zone = zones.get(opening.id);

      openings.push({
        id: opening.id,
        kind: opening.kind,
        widthMm: Math.round(to - from),
        corners: [
          { x: a.x + normal.x * half, y: a.y + normal.y * half },
          { x: b.x + normal.x * half, y: b.y + normal.y * half },
          { x: b.x - normal.x * half, y: b.y - normal.y * half },
          { x: a.x - normal.x * half, y: a.y - normal.y * half },
        ],
        arc: zone ? [zone.hinge, ...swingArc(zone)] : [],
      });
    }
  }

  const items: PlanItem[] = [];
  for (const placement of doc.placements) {
    const product = products.get(placement.sku);
    if (!product) continue;

    const size = placementProductSize(placement, product);
    const box = placementBox(placement, size);
    const mounted = placement.position.y > 0;
    const { forward } = boxAxes(box);
    const shift = (mounted ? -1 : 1) * (size.depthMm / 4);

    items.push({
      instanceId: placement.instanceId,
      sku: placement.sku,
      name: product.name,
      role: product.role,
      corners: boxCorners(box),
      centre: box.centre,
      labelAt: {
        x: box.centre.x + forward.x * shift,
        y: box.centre.y + forward.y * shift,
      },
      widthMm: size.widthMm,
      depthMm: size.depthMm,
      // Навесное висит над рабочей зоной, а не стоит на полу
      mounted,
    });
  }

  const services: PlanService[] = doc.services.map((service: ServicePoint) => {
    const info = serviceInfo(service.kind);
    return {
      id: service.id,
      kind: service.kind,
      name: info.name,
      short: info.short,
      colour: info.colour,
      position: service.position,
      heightMm: service.heightMm,
    };
  });

  const points = [
    ...walls.flatMap((wall) => wall.corners),
    ...items.flatMap((item) => item.corners),
    ...services.map((service) => service.position),
    ...dimensions.flatMap((dimension) => [dimension.start, dimension.end]),
  ];

  const bounds =
    points.length === 0
      ? null
      : {
          minX: Math.min(...points.map((point) => point.x)),
          minY: Math.min(...points.map((point) => point.y)),
          maxX: Math.max(...points.map((point) => point.x)),
          maxY: Math.max(...points.map((point) => point.y)),
        };

  return { walls, openings, items, services, dimensions, bounds, areaSqm };
}
