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
import { markPanel, perimeterMm, roundedBox, segmentedBox, translate } from './geometry.mjs';

/** Стандартный угол распахивания: дверца открывается на прямой угол. */
export const DOOR_OPEN_DEG = 90;

/**
 * Угол распахивания дверцы НАРУЖУ.
 *
 * Знак здесь не вопрос вкуса, и считать его на месте нельзя — так уже
 * разъехалось соглашение о повороте габарита. Правило одно на проект.
 *
 * Перёд модели — её локальная +Z. Поворот обёртки на угол θ переводит
 * точку (x, z) в (x·cos θ + z·sin θ, −x·sin θ + z·cos θ). Свободный край
 * дверцы лежит от петли по оси X, его z после поворота равен −x·sin θ.
 * Чтобы край поехал ВПЕРЁД, нужен z > 0 — а значит знак угла обратен
 * стороне, в которую полотно уходит от петли.
 *
 * @param {number} hingeXMm положение петли по оси X
 * @param {number} doorCentreXMm центр полотна по оси X
 * @param {number} [angleDeg] на сколько распахивается
 */
export function swingOutDeg(hingeXMm, doorCentreXMm, angleDeg = DOOR_OPEN_DEG) {
  const extendsRight = doorCentreXMm >= hingeXMm;
  return extendsRight ? -Math.abs(angleDeg) : Math.abs(angleDeg);
}

/** Кромка фасада толще корпусной: по ней и бьют дверцей. */
export const FACADE_EDGE_THICKNESS = 2;

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
      // У фасада направленный рисунок: при раскрое его не повернуть.
      // Кромка по всему периметру: видны все четыре торца
      {
        grain: true,
        kind: 'facade',
        edgeLengthMm: perimeterMm(widthMm, heightMm),
        edgeThicknessMm: FACADE_EDGE_THICKNESS,
      },
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
  markPanel(parts[0], 'Фасад', widthMm, heightMm, thicknessMm, {
    grain: true,
    kind: 'facade',
    edgeLengthMm: perimeterMm(widthMm, heightMm),
    edgeThicknessMm: FACADE_EDGE_THICKNESS,
  });
  return parts;
}
