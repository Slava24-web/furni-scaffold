import type { Wall } from './schema';
import { wallAngleDeg, wallLengthMm, type Vec2 } from './walls';
import { TOUCH_TOLERANCE_MM, boxAxes, boxCorners, verticallyOverlapping, type Box } from './box';

/**
 * Пересечение габаритов и выталкивание из него.
 *
 * Чистая математика на числах: работает и в браузере при перетаскивании,
 * и на сервере при проверке присланного документа. План лежит в плоскости
 * XZ, поэтому Vec2 здесь это (x, z) мира, всё в миллиметрах.
 */

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

/**
 * Вектор, на который надо сдвинуть A, чтобы он перестал накрывать B.
 *
 * Берётся наименьший из возможных: объект выталкивается по кратчайшему
 * пути, поэтому он скользит вдоль препятствия, а не отскакивает от него.
 * Отскок ощущается как поломка, скольжение — как мебель, которую двигают
 * по полу.
 *
 * null означает, что габариты не пересекаются и выталкивать нечего.
 * Пересечение по высоте обязательно: объект, стоящий НА другом, не
 * накрывает его — это законная постановка друг на друга.
 */
export function separationVector(a: Box, b: Box, toleranceMm = TOUCH_TOLERANCE_MM): Vec2 | null {
  if (!verticallyOverlapping(a, b, toleranceMm)) return null;

  const cornersA = boxCorners(a);
  const cornersB = boxCorners(b);
  const axesA = boxAxes(a);
  const axesB = boxAxes(b);

  let best: { axis: Vec2; depth: number } | null = null;

  for (const axis of [axesA.right, axesA.forward, axesB.right, axesB.forward]) {
    const projectionA = project(cornersA, axis);
    const projectionB = project(cornersB, axis);

    const right = projectionB.max - projectionA.min;
    const left = projectionA.max - projectionB.min;
    if (right <= toleranceMm || left <= toleranceMm) return null;

    // Ближе тот край, через который выталкивать короче
    const depth = Math.min(right, left) + toleranceMm;
    const sign = right < left ? 1 : -1;
    if (!best || depth < best.depth) {
      best = { axis: { x: axis.x * sign, y: axis.y * sign }, depth };
    }
  }

  if (!best) return null;
  return { x: best.axis.x * best.depth, y: best.axis.y * best.depth };
}

/**
 * Позиция, в которой объект никого не накрывает.
 *
 * Выталкивание повторяется: сдвинувшись от одного соседа, объект может
 * налезть на другого. Итераций немного — в углу между тремя модулями
 * решения может не быть вовсе, и бесконечный цикл там дороже, чем
 * оставленное пересечение, о котором и так скажет проверка конфликтов.
 */
export function resolveOverlaps(
  box: Box,
  others: readonly Box[],
  toleranceMm = TOUCH_TOLERANCE_MM,
  maxPasses = 4,
): Vec2 {
  let centre = box.centre;

  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;

    for (const other of others) {
      const push = separationVector({ ...box, centre }, other, toleranceMm);
      if (!push) continue;
      centre = { x: centre.x + push.x, y: centre.y + push.y };
      moved = true;
    }

    if (!moved) break;
  }

  return centre;
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
