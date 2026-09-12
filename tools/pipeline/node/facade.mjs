/**
 * Фасады мебели.
 *
 * Плоская плита читается как заглушка: у настоящего фасада есть рамка
 * и утопленная филёнка, и именно перепад между ними даёт тень, по которой
 * глаз узнаёт мебель. Поэтому фасад собирается из пяти деталей, а не из
 * одной панели — это к тому же дешевле по треугольникам, чем скруглённый
 * брусок с сегментацией.
 *
 * Все размеры в миллиметрах, деталь строится вокруг переданного центра.
 */
import { markPanel, roundedBox, segmentedBox, translate } from './geometry.mjs';

/** Ширина обвязки рамки. */
export const FRAME_WIDTH = 68;
/** Насколько филёнка утоплена от лицевой плоскости рамки. */
export const PANEL_RECESS = 7;
export const PANEL_THICKNESS = 9;
/** Заход филёнки под рамку: без него по контуру видна щель. */
const PANEL_TUCK = 9;

/**
 * Ниже этой высоты рамка не строится: на узком фронте ящика обвязка
 * съедает всю площадь, и филёнка вырождается в щель.
 */
export const MIN_FRAMED_HEIGHT = FRAME_WIDTH * 3;

/**
 * Плоский фасад со снятой кромкой. Годится для фронтов ящиков.
 */
export function flatFacade(widthMm, heightMm, thicknessMm, centre) {
  return [
    markPanel(
      translate(roundedBox(widthMm, heightMm, thicknessMm, 3, 3), centre.x, centre.y, centre.z),
      'Фасад',
      widthMm,
      heightMm,
      thicknessMm,
      // У фасада направленный рисунок: при раскрое его не повернуть
      { grain: true },
    ),
  ];
}

/**
 * Филёнчатый фасад: обвязка из четырёх брусков и утопленная панель.
 *
 * @param {{x: number, y: number, z: number}} centre центр фасада;
 *   z задаёт лицевую плоскость рамки
 */
export function panelFacade(widthMm, heightMm, thicknessMm, centre) {
  if (heightMm < MIN_FRAMED_HEIGHT || widthMm < FRAME_WIDTH * 3) {
    return flatFacade(widthMm, heightMm, thicknessMm, centre);
  }

  const frame = FRAME_WIDTH;
  const stileHeight = heightMm - frame * 2;
  const parts = [];

  const at = (geometry, dx, dy, dz = 0) =>
    translate(geometry, centre.x + dx, centre.y + dy, centre.z + dz);

  // Верхний и нижний бруски во всю ширину
  for (const side of [-1, 1]) {
    parts.push(
      at(segmentedBox(widthMm, frame, thicknessMm, 1), 0, (side * (heightMm - frame)) / 2),
    );
  }

  // Боковые стойки между ними
  for (const side of [-1, 1]) {
    parts.push(
      at(segmentedBox(frame, stileHeight, thicknessMm, 1), (side * (widthMm - frame)) / 2, 0),
    );
  }

  // Филёнка утоплена и заходит под рамку
  parts.push(
    at(
      segmentedBox(
        widthMm - frame * 2 + PANEL_TUCK * 2,
        stileHeight + PANEL_TUCK * 2,
        PANEL_THICKNESS,
        1,
      ),
      0,
      0,
      -(thicknessMm / 2) + PANEL_THICKNESS / 2 + (thicknessMm - PANEL_RECESS - PANEL_THICKNESS),
    ),
  );

  // Заказывают фасад целиком, а не пятью брусками: метка раскроя
  // ставится на одну деталь и несёт габарит всего фасада
  markPanel(parts[0], 'Фасад', widthMm, heightMm, thicknessMm, { grain: true });
  return parts;
}
