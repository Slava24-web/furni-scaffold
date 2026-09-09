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



/**
 * Пересечение двух габаритов по теореме о разделяющей оси.
 *
 * Прямоугольники повёрнуты произвольно, поэтому обычного сравнения
 * координат недостаточно: достаточно проверить четыре оси — по две
 * нормали от каждого прямоугольника.
 */
export function boxesOverlap(a: Box, b: Box, toleranceMm = TOUCH_TOLERANCE_MM): boolean {
  if (!verticallyOverlapping(a, b, toleranceMm)) return false;

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

/** Пересекаются ли габариты по высоте. */
export function verticallyOverlapping(
  a: Pick<Box, 'bottomMm' | 'topMm'>,
  b: Pick<Box, 'bottomMm' | 'topMm'>,
  toleranceMm = TOUCH_TOLERANCE_MM,
): boolean {
  return a.bottomMm < b.topMm - toleranceMm && b.bottomMm < a.topMm - toleranceMm;
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

export type OverlayAlignment = 'leftFlush' | 'rightFlush' | 'centred';

export interface OverlayCandidate {
  position: Vec2;
  rotationDeg: number;
  alignment: OverlayAlignment;
}

/**
 * Позиции, в которых объект выравнивается ПОВЕРХ другого.
 *
 * Нужны для того, что не стоит рядом, а лежит сверху: столешница над
 * нижним рядом, верхний шкаф над нижним. Стыковать их боками нельзя —
 * столешница уехала бы вбок от тумбы вместо того, чтобы лечь на неё.
 *
 * Задняя грань совмещается с задней гранью цели: и столешница, и шкаф
 * прижаты к одной стене, а спереди свесы у них разные. Вдоль ряда даётся
 * три варианта — по левому краю, по правому и по центру: ими собирается
 * и середина ряда, и его торцы.
 */
export function overlayCandidates(
  target: Box,
  movingHalfWidthMm: number,
  movingHalfDepthMm: number,
): OverlayCandidate[] {
  const { right, forward } = boxAxes(target);

  // Совмещение задних граней: смещение вперёд на разницу полуглубин
  const depthShift = movingHalfDepthMm - target.halfDepthMm;
  const base = {
    x: target.centre.x + forward.x * depthShift,
    y: target.centre.y + forward.y * depthShift,
  };

  const shifted = (offset: number, alignment: OverlayAlignment): OverlayCandidate => ({
    position: { x: base.x + right.x * offset, y: base.y + right.y * offset },
    rotationDeg: target.rotationDeg,
    alignment,
  });

  // Совместить левые грани значит сдвинуть центр ВПРАВО на разницу
  // полуширин: широкая столешница выступает вправо, а не влево
  const flush = movingHalfWidthMm - target.halfWidthMm;
  return [
    shifted(flush, 'leftFlush'),
    shifted(-flush, 'rightFlush'),
    shifted(0, 'centred'),
  ];
}

/**
 * Угол направления в плане, градусы.
 *
 * Ноль соответствует направлению +Z, потому что поворот объекта вокруг Y
 * на φ переводит его локальную +Z именно туда. Возвращать atan2(z, x)
 * значило бы держать в коде постоянную поправку на 90°.
 */
export function planAngleDeg(dx: number, dz: number): number {
  return (Math.atan2(dx, dz) * 180) / Math.PI;
}

/** Разница углов, приведённая к диапазону (-180, 180]. */
export function normalizeAngleDeg(deg: number): number {
  const wrapped = ((deg + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/** Лежит ли точка внутри габарита в плане. */
export function boxContainsPoint(box: Box, point: Vec2, toleranceMm = 0): boolean {
  const { right, forward } = boxAxes(box);
  const dx = point.x - box.centre.x;
  const dy = point.y - box.centre.y;

  const alongWidth = Math.abs(dx * right.x + dy * right.y);
  const alongDepth = Math.abs(dx * forward.x + dy * forward.y);

  return (
    alongWidth <= box.halfWidthMm + toleranceMm && alongDepth <= box.halfDepthMm + toleranceMm
  );
}

/**
 * Верх опоры под точкой: на какой высоте окажется объект, поставленный сюда.
 *
 * Ноль означает пол. Берётся максимум, а не первое попадание: над тумбой
 * может лежать столешница, и вещь должна встать на столешницу.
 */
export function supportTopMm(point: Vec2, supports: readonly Box[]): number {
  let top = 0;
  for (const support of supports) {
    if (!boxContainsPoint(support, point)) continue;
    top = Math.max(top, support.topMm);
  }
  return top;
}

/**
 * Высота установки объекта с учётом опоры под ним.
 *
 * Берётся максимум из собственной высоты установки и верха опоры: навесной
 * шкаф остаётся на своей отметке над тумбой, а вещь с нулевой отметкой
 * поднимается на неё.
 */
export function restingHeightMm(mountHeightMm: number, supportTop: number): number {
  return Math.max(mountHeightMm, supportTop);
}

export interface BoxChain {
  /** Идентификаторы объектов, вошедших в цепочку */
  memberIds: string[];
  /** Габарит цепочки целиком */
  box: Box;
}

/**
 * Группировка смежных модулей в цепочки.
 *
 * Ряд кухни это не набор отдельных тумб, а один фронт: столешницу
 * выравнивают по краю ВСЕГО ряда, а не по краю случайной тумбы внутри
 * него. Цепочкой считаются модули одного разворота и одной высоты,
 * стоящие вплотную боками на одной линии по глубине.
 *
 * Одиночный модуль — цепочка из одного элемента, поэтому поведение
 * для отдельно стоящей мебели не меняется.
 */
export function groupIntoChains(
  items: readonly { id: string; box: Box }[],
  toleranceMm = 12,
): BoxChain[] {
  const visited = new Set<number>();
  const chains: BoxChain[] = [];

  for (let start = 0; start < items.length; start++) {
    if (visited.has(start)) continue;

    const group: number[] = [];
    const queue = [start];
    visited.add(start);

    while (queue.length > 0) {
      const current = queue.pop()!;
      group.push(current);

      for (let other = 0; other < items.length; other++) {
        if (visited.has(other)) continue;
        if (!areAdjacent(items[current]!.box, items[other]!.box, toleranceMm)) continue;
        visited.add(other);
        queue.push(other);
      }
    }

    const members = group.map((index) => items[index]!);
    chains.push({
      memberIds: members.map((member) => member.id),
      box: mergeChainBox(members.map((member) => member.box)),
    });
  }

  return chains;
}

/** Стоят ли два габарита вплотную боками на одной линии. */
function areAdjacent(a: Box, b: Box, toleranceMm: number): boolean {
  if (Math.abs(normalizeAngleDeg(a.rotationDeg - b.rotationDeg)) > 1) return false;
  if (Math.abs(a.bottomMm - b.bottomMm) > toleranceMm) return false;
  if (Math.abs(a.topMm - b.topMm) > toleranceMm) return false;

  const { right, forward } = boxAxes(a);
  const dx = b.centre.x - a.centre.x;
  const dy = b.centre.y - a.centre.y;

  // Смещение по глубине означает, что модули стоят не в один фронт
  if (Math.abs(dx * forward.x + dy * forward.y) > toleranceMm) return false;

  const alongWidth = Math.abs(dx * right.x + dy * right.y);
  return Math.abs(alongWidth - (a.halfWidthMm + b.halfWidthMm)) <= toleranceMm;
}

/** Габарит цепочки: протяжённость по всем участникам вдоль общей оси. */
function mergeChainBox(boxes: readonly Box[]): Box {
  const reference = boxes[0]!;
  if (boxes.length === 1) return reference;

  const { right, forward } = boxAxes(reference);
  let min = Infinity;
  let max = -Infinity;
  let halfDepth = 0;

  for (const box of boxes) {
    const offset =
      (box.centre.x - reference.centre.x) * right.x +
      (box.centre.y - reference.centre.y) * right.y;
    min = Math.min(min, offset - box.halfWidthMm);
    max = Math.max(max, offset + box.halfWidthMm);
    halfDepth = Math.max(halfDepth, box.halfDepthMm);
  }

  const centreOffset = (min + max) / 2;
  return {
    centre: {
      x: reference.centre.x + right.x * centreOffset,
      y: reference.centre.y + right.y * centreOffset,
    },
    halfWidthMm: (max - min) / 2,
    halfDepthMm: halfDepth,
    rotationDeg: reference.rotationDeg,
    bottomMm: Math.min(...boxes.map((box) => box.bottomMm)),
    topMm: Math.max(...boxes.map((box) => box.topMm)),
  };
}
