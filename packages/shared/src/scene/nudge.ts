import { boxAxes, type Box } from './box';
import type { Vec2 } from './walls';

/**
 * Быстрая подгонка положения к соседям.
 *
 * Примагничивание во время перетаскивания ловит цель, только пока палец
 * держит объект. Но собирают кухню иначе: поставил модуль примерно,
 * потом двигаешь его на пару сантиметров, чтобы сел вплотную. Ловить
 * мышью зазор в три миллиметра — это и есть та долгая подгонка, на
 * которую жалуются.
 *
 * Здесь два инструмента: прижать к соседу одним действием и сдвинуть
 * на фиксированный шаг с клавиатуры. Оба считают в системе координат
 * самого объекта — «вправо» значит вправо по фасаду, а не по оси мира,
 * иначе у повёрнутой тумбы кнопки означают не то, что нарисовано.
 */

/** Сторона объекта, которой он прижимается. */
export type PushSide = 'left' | 'right' | 'front' | 'back';

/** Шаг сдвига с клавиатуры: миллиметр ловить стрелками бессмысленно. */
export const NUDGE_STEP_MM = 10;
/** Точный шаг: с зажатым модификатором. */
export const NUDGE_FINE_MM = 1;
/** Дальше этого соседа не ищем: прыжок через полкомнаты — не подгонка. */
export const PUSH_REACH_MM = 1500;

const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** Половина габарита соседа в проекции на ось. */
function radiusAlong(box: Box, axis: Vec2): number {
  const axes = boxAxes(box);
  return (
    Math.abs(box.halfWidthMm * dot(axes.right, axis)) +
    Math.abs(box.halfDepthMm * dot(axes.forward, axis))
  );
}

/** Пересекаются ли объекты по высоте: иначе это не сосед, а этаж выше. */
const sameLevel = (a: Box, b: Box): boolean =>
  a.bottomMm < b.topMm - 1 && b.bottomMm < a.topMm - 1;

/** Ось и знак для стороны в системе координат объекта. */
function direction(subject: Box, side: PushSide): { axis: Vec2; across: Vec2 } {
  const { right, forward } = boxAxes(subject);
  const flip = (v: Vec2): Vec2 => ({ x: -v.x, y: -v.y });

  if (side === 'right') return { axis: right, across: forward };
  if (side === 'left') return { axis: flip(right), across: forward };
  if (side === 'front') return { axis: forward, across: right };
  return { axis: flip(forward), across: right };
}

/**
 * Куда сдвинуть объект, чтобы он встал вплотную к ближайшему соседу
 * с этой стороны. null — соседа в пределах досягаемости нет.
 *
 * Возвращается новый центр, а не смещение: вызывающий код пишет позицию
 * целиком, и считать сумму ему незачем.
 */
export function pushAgainst(
  subject: Box,
  neighbours: readonly Box[],
  side: PushSide,
  reachMm = PUSH_REACH_MM,
): Vec2 | null {
  const { axis, across } = direction(subject, side);
  const halfAlong = radiusAlong(subject, axis);
  const halfAcross = radiusAlong(subject, across);

  let best: number | null = null;

  for (const neighbour of neighbours) {
    if (!sameLevel(subject, neighbour)) continue;

    const between = {
      x: neighbour.centre.x - subject.centre.x,
      y: neighbour.centre.y - subject.centre.y,
    };

    // Сосед должен быть с нужной стороны, а не за спиной
    const along = dot(between, axis);
    if (along <= 0) continue;

    // И в створе: разъехавшийся вбок сосед этой гранью не встречается
    const offset = Math.abs(dot(between, across));
    if (offset >= halfAcross + radiusAlong(neighbour, across)) continue;

    const gap = along - halfAlong - radiusAlong(neighbour, axis);
    if (gap < 0 || gap > reachMm) continue;
    if (best === null || gap < best) best = gap;
  }

  if (best === null) return null;
  return {
    x: subject.centre.x + axis.x * best,
    y: subject.centre.y + axis.y * best,
  };
}

/**
 * Сдвиг на шаг по своей оси.
 *
 * Стрелки на клавиатуре двигают объект вдоль его собственных осей:
 * у повёрнутой тумбы «вправо» — это вдоль фасада, а не вдоль оси мира.
 */
export function nudge(subject: Box, side: PushSide, stepMm: number): Vec2 {
  const { axis } = direction(subject, side);
  return {
    x: subject.centre.x + axis.x * stepMm,
    y: subject.centre.y + axis.y * stepMm,
  };
}
