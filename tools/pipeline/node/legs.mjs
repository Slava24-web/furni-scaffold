/**
 * Опоры корпусной мебели.
 *
 * Раньше шкаф и комод стояли на глухом цоколе — коробка, поставленная
 * прямо на пол. Мебель на ножках читается как предмет, а не как встроенный
 * модуль: под ней видно пол, и объём корпуса отрывается от плоскости.
 *
 * Цоколь остаётся у кухонных модулей: там он не декорация, а закрытый
 * короб под гарнитуром, и заменять его ножками было бы неверно.
 *
 * Все размеры в миллиметрах, origin изделия — низ габарита (CLAUDE.md).
 */
import { taperedCylinder, translate } from './geometry.mjs';

/** Высота ножки по умолчанию: столько же занимал прежний цоколь. */
export const LEG_HEIGHT = 90;
/** Отступ центра ножки от габарита корпуса. */
export const LEG_INSET = 70;

/**
 * Четыре конические ножки по углам корпуса.
 *
 * Ножка сужается книзу: прямой цилиндр под корпусом выглядит подставкой,
 * а конус — мебельной опорой.
 *
 * @param {number} widthMm габарит корпуса
 * @param {number} depthMm габарит корпуса
 * @param {{heightMm?: number, insetMm?: number, topRadiusMm?: number,
 *          bottomRadiusMm?: number, segments?: number}} [options]
 */
export function taperedLegs(widthMm, depthMm, options = {}) {
  const {
    heightMm = LEG_HEIGHT,
    insetMm = LEG_INSET,
    topRadiusMm = 26,
    bottomRadiusMm = 16,
    segments = 10,
  } = options;

  // Ножка не может выйти за габарит: иначе изделие занимает больше места,
  // чем записано в каталоге, и стыковка модулей разъезжается
  const inset = Math.min(insetMm, Math.min(widthMm, depthMm) / 2 - topRadiusMm);

  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      legs.push(
        translate(
          taperedCylinder(topRadiusMm, bottomRadiusMm, heightMm, segments),
          sx * (widthMm / 2 - inset),
          heightMm / 2,
          sz * (depthMm / 2 - inset),
        ),
      );
    }
  }
  return legs;
}
