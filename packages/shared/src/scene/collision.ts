import type { Placement, Wall } from './schema';
import { isClosedContour, wallAngleDeg, wallLengthMm, type Vec2 } from './walls';

/**
 * Габариты объектов в плане, их пересечение и точки стыковки.
 *
 * Чистая математика на числах: работает и в браузере при перетаскивании,
 * и на сервере при проверке присланного документа. План лежит в плоскости
 * XZ, поэтому Vec2 здесь это (x, z) мира, всё в миллиметрах.
 */

/**
 * Габарит объекта: прямоугольник в плане плюс диапазон высот.
 *
 * Без высоты проверка бесполезна: верхний шкаф висит ровно над нижним
 * и в плане с ним совпадает. Считать это пересечением нельзя.
 */
export interface Box {
  centre: Vec2;
  /** Полуразмер вдоль локальной оси X объекта */
  halfWidthMm: number;
  /** Полуразмер вдоль локальной оси Z объекта */
  halfDepthMm: number;
  rotationDeg: number;
  bottomMm: number;
  topMm: number;
}

/**
 * Допуск на соприкосновение.
 *
 * Модули, поставленные вплотную, делят общую грань, и без допуска каждая
 * состыкованная пара считалась бы конфликтом. Два миллиметра меньше любого
 * технологического зазора и больше ошибки округления.
 */
export const TOUCH_TOLERANCE_MM = 2;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Локальные оси объекта в координатах плана.
 *
 * Поворот вокруг Y на φ переводит локальную +X в (cos φ, −sin φ),
 * а локальную +Z в (sin φ, cos φ). Знаки именно такие, потому что ось Y
 * смотрит вверх, а план читается сверху.
 */
export function boxAxes(box: Pick<Box, 'rotationDeg'>): { right: Vec2; forward: Vec2 } {
  const angle = toRad(box.rotationDeg);
  return {
    right: { x: Math.cos(angle), y: -Math.sin(angle) },
    forward: { x: Math.sin(angle), y: Math.cos(angle) },
  };
}

export function boxCorners(box: Box): Vec2[] {
  const { right, forward } = boxAxes(box);
  return [
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
  ].map(([sx, sz]) => ({
    x: box.centre.x + right.x * box.halfWidthMm * sx! + forward.x * box.halfDepthMm * sz!,
    y: box.centre.y + right.y * box.halfWidthMm * sx! + forward.y * box.halfDepthMm * sz!,
  }));
}

function project(points: readonly Vec2[], axis: Vec2): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

function verticalOverlap(a: Box, b: Box, toleranceMm: number): boolean {
  return a.bottomMm < b.topMm - toleranceMm && b.bottomMm < a.topMm - toleranceMm;
}

/**
 * Пересечение двух габаритов по теореме о разделяющей оси.
 *
 * Прямоугольники повёрнуты произвольно, поэтому обычного сравнения
 * координат недостаточно: достаточно проверить четыре оси — по две
 * нормали от каждого прямоугольника.
 */
export function boxesOverlap(a: Box, b: Box, toleranceMm = TOUCH_TOLERANCE_MM): boolean {
  if (!verticalOverlap(a, b, toleranceMm)) return false;

  const cornersA = boxCorners(a);
  const cornersB = boxCorners(b);
  const axesA = boxAxes(a);
  const axesB = boxAxes(b);

  for (const axis of [axesA.right, axesA.forward, axesB.right, axesB.forward]) {
    const projectionA = project(cornersA, axis);
    const projectionB = project(cornersB, axis);
    // Зазор хотя бы по одной оси означает отсутствие пересечения
    if (
      projectionA.min > projectionB.max - toleranceMm ||
      projectionB.min > projectionA.max - toleranceMm
    ) {
      return false;
    }
  }

  return true;
}

/** Стена как габарит: осевая линия по длине, толщина поперёк. */
export function wallToBox(wall: Wall): Box {
  return {
    centre: {
      x: (wall.start.x + wall.end.x) / 2,
      y: (wall.start.y + wall.end.y) / 2,
    },
    halfWidthMm: wallLengthMm(wall) / 2,
    halfDepthMm: wall.thickness / 2,
    // Локальная +X габарита должна лечь вдоль стены: угол стены отсчитан
    // от оси X плана, а поворот объекта — в обратную сторону
    rotationDeg: -wallAngleDeg(wall),
    bottomMm: 0,
    topMm: wall.height,
  };
}

export type DockSide = 'right' | 'left' | 'front' | 'back';

export interface DockCandidate {
  position: Vec2;
  rotationDeg: number;
  side: DockSide;
}

/**
 * Позиции, в которых объект встаёт вплотную к соседу.
 *
 * Стыковка идёт по граням, а не по центрам: кухонные модули собираются
 * в ряд без зазоров, и притягивание центра к центру ставило бы их
 * друг на друга. Разворот наследуется от соседа — ряд обязан смотреть
 * в одну сторону.
 */
export function dockCandidates(
  target: Box,
  movingHalfWidthMm: number,
  movingHalfDepthMm: number,
): DockCandidate[] {
  const { right, forward } = boxAxes(target);

  const along = (axis: Vec2, distance: number, side: DockSide): DockCandidate => ({
    position: {
      x: target.centre.x + axis.x * distance,
      y: target.centre.y + axis.y * distance,
    },
    rotationDeg: target.rotationDeg,
    side,
  });

  const sideways = target.halfWidthMm + movingHalfWidthMm;
  const depthways = target.halfDepthMm + movingHalfDepthMm;

  return [
    along(right, sideways, 'right'),
    along(right, -sideways, 'left'),
    along(forward, depthways, 'front'),
    along(forward, -depthways, 'back'),
  ];
}

/**
 * Лежит ли точка внутри контура стен.
 *
 * Луч вправо и подсчёт пересечений: контур может быть невыпуклым,
 * а проверка по габаритному прямоугольнику дала бы ложный ответ
 * для Г-образной комнаты.
 */
export function isInsideContour(point: Vec2, walls: readonly Wall[]): boolean {
  if (walls.length < 3) return false;

  let inside = false;
  for (const wall of walls) {
    const a = wall.start;
    const b = wall.end;
    const crossesRay = a.y > point.y !== b.y > point.y;
    if (!crossesRay) continue;

    const intersectX = a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x);
    if (point.x < intersectX) inside = !inside;
  }
  return inside;
}

/** Габариты изделия из каталога, мм. */
export interface ProductSize {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

/**
 * Габарит размещённого объекта.
 *
 * Низ берётся из позиции: высота установки хранится там, и навесной
 * модуль по документу висит, а не стоит на полу.
 */
export function placementBox(
  placement: Pick<Placement, 'position' | 'rotationY'>,
  size: ProductSize,
): Box {
  return {
    centre: { x: placement.position.x, y: placement.position.z },
    halfWidthMm: size.widthMm / 2,
    halfDepthMm: size.depthMm / 2,
    rotationDeg: placement.rotationY,
    bottomMm: placement.position.y,
    topMm: placement.position.y + size.heightMm,
  };
}

export interface ConflictReport {
  /** instanceId объектов, с которыми есть пересечение */
  objectIds: string[];
  /** id стен, в которые объект врезался */
  wallIds: string[];
  /** Объект вынесен за пределы замкнутого помещения */
  outsideRoom: boolean;
}

export function hasConflicts(report: ConflictReport): boolean {
  return report.objectIds.length > 0 || report.wallIds.length > 0 || report.outsideRoom;
}

export const EMPTY_CONFLICTS: ConflictReport = {
  objectIds: [],
  wallIds: [],
  outsideRoom: false,
};

/**
 * Конфликты объекта с обстановкой.
 *
 * Проверка сообщает о проблеме, но не запрещает движение: заблокированное
 * перетаскивание ощущается как поломка, а пользователю нужно иметь
 * возможность протащить предмет мимо препятствия (ТЗ, подсветка конфликтов).
 *
 * Выход за пределы помещения проверяется только для ЗАМКНУТОГО контура:
 * пока стены рисуются, ломаная не образует помещения, и любой объект
 * формально оказался бы снаружи.
 */
export function findConflicts(
  subject: Box,
  others: readonly { id: string; box: Box }[],
  walls: readonly Wall[],
  toleranceMm = TOUCH_TOLERANCE_MM,
): ConflictReport {
  const objectIds: string[] = [];
  for (const other of others) {
    if (boxesOverlap(subject, other.box, toleranceMm)) objectIds.push(other.id);
  }

  const wallIds: string[] = [];
  for (const wall of walls) {
    if (boxesOverlap(subject, wallToBox(wall), toleranceMm)) wallIds.push(wall.id);
  }

  const outsideRoom = isClosedContour(walls) && !isInsideContour(subject.centre, walls);

  return { objectIds, wallIds, outsideRoom };
}
