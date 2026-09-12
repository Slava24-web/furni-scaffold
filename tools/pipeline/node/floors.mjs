/**
 * Напольные покрытия демо-тенанта `test`.
 *
 * Пол занимает больше площади, чем вся мебель вместе взятая, и серый
 * бетон под гарнитуром рушит впечатление от планировки сильнее, чем
 * любая деталь фасада. Покрытия разложены по типам, как в магазине:
 * ламинат, паркет, инженерная доска, плитка — с разными цветами и
 * рисунком укладки.
 *
 * Текстура рисуется процедурно и детерминированно: одинаковый вход даёт
 * одинаковый файл, иначе checksum менялся бы на каждом прогоне и
 * пайплайн терял бы идемпотентность.
 *
 * `repeatMm` — физический размер квадрата текстуры. Без него доска
 * растягивается на всю комнату и превращается в узор непонятного
 * масштаба.
 */
import sharp from 'sharp';

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

/**
 * Детерминированный шум, замкнутый по обеим осям.
 *
 * Обычный хеш по координате даёт видимый шов на стыке плиток текстуры:
 * пол выкладывается ею сотни раз, и шов читается сеткой на всю комнату.
 */
function cellNoise(ix, iy, periodX, periodY, seed) {
  const x = ((ix % periodX) + periodX) % periodX;
  const y = ((iy % periodY) + periodY) % periodY;
  let h = (x * 374761393 + y * 668265263 + seed * 69069) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Полосы волокна вдоль доски. */
function grain(u, v, seed) {
  const fibre = Math.sin(u * 0.9 + Math.sin(v * 0.15 + seed) * 2.2) * 0.5 + 0.5;
  const fine = Math.sin(u * 3.7 + seed * 5) * 0.5 + 0.5;
  return fibre * 0.06 + fine * 0.02;
}

/**
 * Раскладка: какой доске принадлежит точка и как она повёрнута.
 *
 * Возвращает индексы доски и координаты внутри неё в миллиметрах —
 * дальше рисунок один и тот же для всех узоров, различается только
 * разбиение.
 */
function layout(pattern, xMm, yMm, spec) {
  const { plankLengthMm: length, plankWidthMm: width } = spec;

  if (pattern === 'deck') {
    // Палубная укладка: ряды со смещением на треть доски
    const row = Math.floor(yMm / width);
    const shifted = xMm + row * (length / 3);
    return {
      ix: Math.floor(shifted / length),
      iy: row,
      u: shifted - Math.floor(shifted / length) * length,
      v: yMm - row * width,
      lengthMm: length,
      widthMm: width,
    };
  }

  if (pattern === 'chevron') {
    // Ёлочка: соседние колонки наклонены в разные стороны
    const column = Math.floor(xMm / length);
    const sign = column % 2 === 0 ? 1 : -1;
    const sheared = yMm + sign * (xMm - column * length);
    const row = Math.floor(sheared / width);
    return {
      ix: column,
      iy: row,
      u: xMm - column * length,
      v: sheared - row * width,
      lengthMm: length,
      widthMm: width,
    };
  }

  if (pattern === 'square') {
    // Квадратами: соседние клетки развёрнуты на 90°
    const cell = spec.cellMm ?? length;
    const cx = Math.floor(xMm / cell);
    const cy = Math.floor(yMm / cell);
    const localX = xMm - cx * cell;
    const localY = yMm - cy * cell;
    const turned = (cx + cy) % 2 === 0;
    const along = turned ? localX : localY;
    const across = turned ? localY : localX;
    return {
      ix: cx * 31 + cy * 7 + Math.floor(across / width),
      iy: turned ? 1 : 2,
      u: along,
      v: across - Math.floor(across / width) * width,
      lengthMm: cell,
      widthMm: width,
    };
  }

  // Плитка: сетка со швом
  const tile = spec.cellMm ?? length;
  const tx = Math.floor(xMm / tile);
  const ty = Math.floor(yMm / tile);
  return {
    ix: tx,
    iy: ty,
    u: xMm - tx * tile,
    v: yMm - ty * tile,
    lengthMm: tile,
    widthMm: tile,
  };
}

/**
 * Текстура покрытия.
 *
 * @param {number} sizePx сторона изображения
 * @param {{pattern: string, repeatMm: number, plankLengthMm: number,
 *          plankWidthMm: number, cellMm?: number, colour: number[],
 *          accent?: number[], seamStrength?: number, seed?: number}} spec
 */
export async function floorTexture(sizePx, spec) {
  const {
    pattern,
    repeatMm,
    colour,
    accent = null,
    seamStrength = 0.22,
    seed = 3,
  } = spec;

  const data = Buffer.alloc(sizePx * sizePx * 3);
  const mmPerPx = repeatMm / sizePx;
  const periodX = Math.max(1, Math.round(repeatMm / spec.plankLengthMm) * 4);
  const periodY = Math.max(1, Math.round(repeatMm / spec.plankWidthMm) * 4);
  const isTile = pattern === 'tile';
  const seamMm = isTile ? 6 : 2;

  for (let py = 0; py < sizePx; py++) {
    for (let px = 0; px < sizePx; px++) {
      const cell = layout(pattern, px * mmPerPx, py * mmPerPx, spec);
      const shade = cellNoise(cell.ix, cell.iy, periodX, periodY, seed);

      // Шов между досками: тёмная линия по краю детали
      const nearSeam =
        cell.u < seamMm ||
        cell.v < seamMm ||
        cell.lengthMm - cell.u < seamMm ||
        cell.widthMm - cell.v < seamMm;

      // Шахматка: соседние плитки другого тона
      const checkered = accent && (cell.ix + cell.iy) % 2 === 1;
      const base = checkered ? accent : colour;

      let tone = 0.94 + shade * 0.12;
      if (!isTile) tone += grain(cell.u * 0.05, cell.v * 0.4, cell.ix + cell.iy);
      if (nearSeam) tone -= seamStrength;

      const index = (py * sizePx + px) * 3;
      data[index] = clampByte(base[0] * tone);
      data[index + 1] = clampByte(base[1] * tone);
      data[index + 2] = clampByte(base[2] * tone);
    }
  }

  return sharp(data, { raw: { width: sizePx, height: sizePx, channels: 3 } }).png().toBuffer();
}

/**
 * Ряд покрытий тенанта.
 *
 * Размеры доски и плитки взяты из ходового ряда: ламинат 1200×195,
 * инженерная доска 1800×220, паркетная планка 420×70, керамогранит
 * 600×600.
 */
export const FLOOR_FINISHES = [
  {
    code: 'floor-laminate-oak',
    name: 'Ламинат «Дуб натуральный»',
    kind: 'Ламинат',
    pattern: 'deck',
    repeatMm: 1200,
    plankLengthMm: 1200,
    plankWidthMm: 195,
    colour: [196, 164, 122],
    roughness: 0.72,
  },
  {
    code: 'floor-laminate-grey',
    name: 'Ламинат «Дуб серый»',
    kind: 'Ламинат',
    pattern: 'deck',
    repeatMm: 1200,
    plankLengthMm: 1200,
    plankWidthMm: 195,
    colour: [156, 154, 150],
    roughness: 0.74,
  },
  {
    code: 'floor-laminate-walnut',
    name: 'Ламинат «Орех тёмный»',
    kind: 'Ламинат',
    pattern: 'deck',
    repeatMm: 1200,
    plankLengthMm: 1200,
    plankWidthMm: 195,
    colour: [112, 80, 58],
    roughness: 0.7,
  },
  {
    code: 'floor-parquet-herringbone',
    name: 'Паркет «Ёлочка»',
    kind: 'Паркет',
    pattern: 'chevron',
    repeatMm: 1260,
    plankLengthMm: 420,
    plankWidthMm: 70,
    colour: [188, 150, 106],
    roughness: 0.58,
  },
  {
    code: 'floor-parquet-wenge',
    name: 'Паркет «Венге»',
    kind: 'Паркет',
    pattern: 'chevron',
    repeatMm: 1260,
    plankLengthMm: 420,
    plankWidthMm: 70,
    colour: [92, 68, 56],
    roughness: 0.56,
  },
  {
    code: 'floor-parquet-square',
    name: 'Паркет «Квадраты»',
    kind: 'Паркет',
    pattern: 'square',
    repeatMm: 1200,
    plankLengthMm: 600,
    plankWidthMm: 75,
    cellMm: 600,
    colour: [178, 142, 100],
    roughness: 0.58,
  },
  {
    code: 'floor-engineered-white',
    name: 'Инженерная доска «Дуб белёный»',
    kind: 'Инженерная доска',
    pattern: 'deck',
    repeatMm: 1800,
    plankLengthMm: 1800,
    plankWidthMm: 220,
    colour: [214, 205, 190],
    roughness: 0.64,
  },
  {
    code: 'floor-engineered-smoked',
    name: 'Инженерная доска «Дуб брашированный»',
    kind: 'Инженерная доска',
    pattern: 'deck',
    repeatMm: 1800,
    plankLengthMm: 1800,
    plankWidthMm: 220,
    colour: [148, 116, 84],
    roughness: 0.68,
  },
  {
    code: 'floor-tile-light',
    name: 'Керамогранит светло-серый 600',
    kind: 'Плитка',
    pattern: 'tile',
    repeatMm: 1200,
    plankLengthMm: 600,
    plankWidthMm: 600,
    cellMm: 600,
    colour: [206, 204, 200],
    roughness: 0.35,
  },
  {
    code: 'floor-tile-graphite',
    name: 'Керамогранит графитовый 600',
    kind: 'Плитка',
    pattern: 'tile',
    repeatMm: 1200,
    plankLengthMm: 600,
    plankWidthMm: 600,
    cellMm: 600,
    colour: [92, 94, 98],
    roughness: 0.32,
  },
  {
    code: 'floor-tile-checker',
    name: 'Плитка «Шахматка» 300',
    kind: 'Плитка',
    pattern: 'tile',
    repeatMm: 1200,
    plankLengthMm: 300,
    plankWidthMm: 300,
    cellMm: 300,
    colour: [226, 224, 220],
    accent: [78, 80, 84],
    roughness: 0.3,
  },
];
