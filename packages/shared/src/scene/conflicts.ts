import type { Wall } from './schema';
import { isClosedContour, isInsideContour } from './walls';
import { blockedSwings, type SwingZone } from './swing';
import { TOUCH_TOLERANCE_MM, type Box } from './box';
import { boxesOverlap, wallToBox } from './overlap';

/**
 * Отчёт о конфликтах объекта с обстановкой.
 *
 * Собирает воедино пересечения с мебелью и стенами, выход за контур,
 * зоны открывания дверей и зоны выдвижения ящиков: пользователю нужен
 * один ответ «что не так», а не пять разных проверок.
 */

/**
 * Зоны выдвижения ящиков вокруг проверяемого объекта.
 *
 * Считаются снаружи и передаются готовыми: во время перетаскивания они
 * не меняются, а пересчёт на каждое движение указателя означал бы обход
 * всей сцены в горячем пути.
 */
export interface DrawerContext {
  /** Зона самого проверяемого объекта */
  own?: Box | null;
  /** Зоны соседей */
  neighbours?: readonly { instanceId: string; box: Box }[];
}

export interface ConflictReport {
  /** instanceId объектов, с которыми есть пересечение */
  objectIds: string[];
  /** id стен, в которые объект врезался */
  wallIds: string[];
  /** Объект вынесен за пределы замкнутого помещения */
  outsideRoom: boolean;
  /** id проёмов, открыванию которых объект мешает */
  openingIds: string[];
  /** instanceId соседей, чьим ящикам объект не даёт выдвинуться */
  blockedDrawerIds: string[];
  /** Ящикам самого объекта не хватает места перед фасадом */
  ownDrawersBlocked: boolean;
}

export function hasConflicts(report: ConflictReport): boolean {
  return (
    report.objectIds.length > 0 ||
    report.wallIds.length > 0 ||
    report.openingIds.length > 0 ||
    report.blockedDrawerIds.length > 0 ||
    report.ownDrawersBlocked ||
    report.outsideRoom
  );
}

export const EMPTY_CONFLICTS: ConflictReport = {
  objectIds: [],
  wallIds: [],
  outsideRoom: false,
  openingIds: [],
  blockedDrawerIds: [],
  ownDrawersBlocked: false,
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
  swings: readonly SwingZone[] = [],
  drawers: DrawerContext = {},
): ConflictReport {
  const objectIds: string[] = [];
  for (const other of others) {
    if (boxesOverlap(subject, other.box, toleranceMm)) objectIds.push(other.id);
  }

  // Габарит стены считается один раз на вызов: он нужен и здесь,
  // и ниже для зоны выдвижения, а проверка идёт на каждое движение
  // указателя во время перетаскивания
  const wallBoxes = walls.map((wall) => wallToBox(wall));

  const wallIds: string[] = [];
  for (let i = 0; i < walls.length; i++) {
    if (boxesOverlap(subject, wallBoxes[i]!, toleranceMm)) wallIds.push(walls[i]!.id);
  }

  const outsideRoom = isClosedContour(walls) && !isInsideContour(subject.centre, walls);
  // Зона открывания двери — такое же препятствие, как стена: объект,
  // поставленный в неё, не даст двери открыться
  const openingIds = blockedSwings(swings, subject);

  // Ящик, которому некуда выехать, — такое же препятствие, как стена,
  // и мешать могут обе стороны: и объект соседу, и сосед объекту
  const blockedDrawerIds: string[] = [];
  for (const zone of drawers.neighbours ?? []) {
    if (boxesOverlap(subject, zone.box, toleranceMm)) blockedDrawerIds.push(zone.instanceId);
  }

  const own = drawers.own;
  const ownDrawersBlocked =
    own !== undefined &&
    own !== null &&
    (others.some((other) => boxesOverlap(own, other.box, toleranceMm)) ||
      wallBoxes.some((wallBox) => boxesOverlap(own, wallBox, toleranceMm)));

  return { objectIds, wallIds, outsideRoom, openingIds, blockedDrawerIds, ownDrawersBlocked };
}
