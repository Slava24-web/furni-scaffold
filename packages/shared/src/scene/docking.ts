import { boxAxes, normalizeAngleDeg, type Box } from './box';
import type { Vec2 } from './walls';

/**
 * Как объекты пристраиваются друг к другу.
 *
 * Три способа: встать вплотную сбоку, лечь поверх и слиться в ряд.
 * Все они смотрят на габариты соседа и не знают ни о сцене, ни о
 * каталоге — цели привязки строятся из результата снаружи.
 */

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

  const { right } = boxAxes(reference);
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
