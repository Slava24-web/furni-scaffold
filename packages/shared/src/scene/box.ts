import type { Vec2 } from './walls';

/**
 * Габарит в плане и операции над ним.
 *
 * Вынесено отдельным модулем не ради красоты: соглашение о повороте
 * здесь ровно одно. Пока углы габарита считались в двух местах, они
 * успели разойтись знаком, и проверка зоны открывания брала зеркальный
 * прямоугольник для любого повёрнутого объекта.
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
  /**
   * Высота, на которой на объекте стоят. По умолчанию это его верх.
   *
   * Отличается там, где габарит выше рабочей поверхности: у столешницы
   * в него входит пристенный плинтус, но мойку ставят на плиту. Без
   * этого числа мойка на столешнице считалась бы пересечением.
   */
  surfaceTopMm?: number;
}

/**
 * Допуск на соприкосновение.
 *
 * Модули, поставленные вплотную, делят общую грань, и без допуска каждая
 * состыкованная пара считалась бы конфликтом. Два миллиметра меньше любого
 * технологического зазора и больше ошибки округления.
 */
export const TOUCH_TOLERANCE_MM = 2;

export const toRad = (deg: number): number => (deg * Math.PI) / 180;

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

/** Лежит ли точка плана внутри габарита. */
export function insideBox(box: Box, point: Vec2): boolean {
  const { right, forward } = boxAxes(box);
  const dx = point.x - box.centre.x;
  const dy = point.y - box.centre.y;

  // Проекции на локальные оси: в них проверка сводится к сравнению
  const alongRight = dx * right.x + dy * right.y;
  const alongForward = dx * forward.x + dy * forward.y;
  return Math.abs(alongRight) <= box.halfWidthMm && Math.abs(alongForward) <= box.halfDepthMm;
}

/**
 * Пересекаются ли габариты по высоте.
 *
 * Объект, стоящий НА рабочей поверхности другого, пересечением не
 * считается: так ставят мойку на столешницу и микроволновку на тумбу.
 */
export function verticallyOverlapping(
  a: Pick<Box, 'bottomMm' | 'topMm' | 'surfaceTopMm'>,
  b: Pick<Box, 'bottomMm' | 'topMm' | 'surfaceTopMm'>,
  toleranceMm = TOUCH_TOLERANCE_MM,
): boolean {
  const restsOnB = a.bottomMm >= (b.surfaceTopMm ?? b.topMm) - toleranceMm;
  const restsOnA = b.bottomMm >= (a.surfaceTopMm ?? a.topMm) - toleranceMm;
  if (restsOnB || restsOnA) return false;

  return a.bottomMm < b.topMm - toleranceMm && b.bottomMm < a.topMm - toleranceMm;
}
