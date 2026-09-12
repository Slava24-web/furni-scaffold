/**
 * Бытовая техника и вытяжки демо-тенанта `test`.
 *
 * Кухня без техники не проектируется: холодильник и стиральная машина
 * задают её раскладку не меньше, чем тумбы, а вытяжка привязана к
 * варочной панели. Размеры взяты из стандартного ряда встраиваемой
 * техники — 600 по фронту, 820 по высоте под столешницу, 550–570
 * по глубине ниши.
 *
 * Все размеры в миллиметрах, origin — низ-центр габарита (CLAUDE.md).
 */
import { cylinder, roundedBox, rotateX, segmentedBox, translate } from './geometry.mjs';

/** Стандартный фронт встраиваемой техники и глубина ниши. */
const NICHE_WIDTH = 600;
const NICHE_DEPTH = 560;

/** Зазор между дверцами и корпусом: без него фронт читается монолитом. */
const GAP = 6;

function boxAt(w, h, d, x, y, z, radius = 4, segments = 3) {
  return translate(roundedBox(w, h, d, radius, segments), x, y, z);
}

/** Горизонтальная ручка-рейлинг на фронте техники. */
function bar(lengthMm, x, y, z) {
  return [
    translate(roundedBox(lengthMm, 20, 20, 9, 4), x, y, z + 26),
    translate(segmentedBox(18, 18, 26, 1), x - lengthMm / 2 + 20, y, z + 13),
    translate(segmentedBox(18, 18, 26, 1), x + lengthMm / 2 - 20, y, z + 13),
  ];
}

/** Вертикальная ручка холодильника. */
function verticalBar(lengthMm, x, y, z) {
  return [
    translate(roundedBox(20, lengthMm, 20, 9, 4), x, y, z + 26),
    translate(segmentedBox(18, 18, 26, 1), x, y - lengthMm / 2 + 20, z + 13),
    translate(segmentedBox(18, 18, 26, 1), x, y + lengthMm / 2 - 20, z + 13),
  ];
}

/** Круглое стекло: цилиндр строится вдоль Y, поэтому кладём его набок. */
function porthole(radiusMm, thicknessMm, x, y, z) {
  return translate(rotateX(cylinder(radiusMm, thicknessMm, 20), Math.PI / 2), x, y, z);
}

/** Ряд поворотных переключателей. */
function knobs(count, spacingMm, x, y, z) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) / 2) * spacingMm;
    parts.push(translate(rotateX(cylinder(17, 26, 14), Math.PI / 2), x + offset, y, z + 13));
  }
  return parts;
}

/**
 * Двухкамерный холодильник: морозильник снизу, холодильник сверху.
 *
 * Фронт разрезан на две дверцы: сплошная панель во всю высоту читается
 * шкафом, а не холодильником.
 */
function fridge(widthMm, heightMm, depthMm, freezerShare = 0.36) {
  const front = depthMm / 2;
  const freezer = Math.round(heightMm * freezerShare);
  const fridgeHeight = heightMm - freezer - GAP;

  const doorWidth = widthMm - GAP * 2;
  const doorDepth = 26;
  const fridgeCentre = freezer + GAP + fridgeHeight / 2;

  return {
    white: [boxAt(widthMm, heightMm, depthMm - doorDepth, 0, heightMm / 2, -doorDepth / 2, 6, 4)],
    steel: [
      boxAt(doorWidth, fridgeHeight, doorDepth, 0, fridgeCentre, front - doorDepth / 2),
      boxAt(doorWidth, freezer, doorDepth, 0, freezer / 2, front - doorDepth / 2),
      ...verticalBar(Math.min(700, fridgeHeight - 120), widthMm / 2 - 70, fridgeCentre, front),
      ...verticalBar(Math.min(300, freezer - 80), widthMm / 2 - 70, freezer / 2, front),
    ],
  };
}

/**
 * Side-by-Side: две камеры рядом, а не одна над другой.
 *
 * Разрез фронта вертикальный — именно им этот тип и отличается от
 * обычного двухкамерного, и горизонтальный разрез назвал бы Side-by-Side
 * то, чем он не является.
 */
function sideBySideFridge(widthMm, heightMm, depthMm) {
  const front = depthMm / 2;
  const doorDepth = 26;
  const doorWidth = (widthMm - GAP * 3) / 2;
  const doorHeight = heightMm - GAP * 2;

  const doors = [];
  for (const side of [-1, 1]) {
    const x = side * (doorWidth + GAP) / 2;
    doors.push(boxAt(doorWidth, doorHeight, doorDepth, x, heightMm / 2, front - doorDepth / 2));
    // Ручки сведены к центральному стыку: так открывают обе камеры сразу
    doors.push(...verticalBar(doorHeight - 400, x + side * (doorWidth / 2 - 70), heightMm / 2, front));
  }

  return {
    white: [boxAt(widthMm, heightMm, depthMm - doorDepth, 0, heightMm / 2, -doorDepth / 2, 6, 4)],
    steel: doors,
  };
}

/** Стиральная или посудомоечная машина с люком. */
function washer() {
  const width = NICHE_WIDTH;
  const height = 850;
  const depth = NICHE_DEPTH;
  const front = depth / 2;

  return {
    white: [
      boxAt(width, height, depth - 24, 0, height / 2, -12, 5, 4),
      boxAt(width - GAP * 2, height - 160, 24, 0, height / 2 - 60, front - 12),
    ],
    graphite: [
      // Панель управления и стекло люка: тёмные детали задают лицо машины
      boxAt(width - GAP * 2, 110, 26, 0, height - 75, front - 13, 5, 3),
      porthole(190, 30, 0, height / 2 - 60, front + 2),
    ],
    steel: [porthole(230, 22, 0, height / 2 - 60, front - 4)],
  };
}

/** Посудомоечная машина: фронт под фасад, панель управления по верху. */
function dishwasher() {
  const width = NICHE_WIDTH;
  const height = 820;
  const depth = 570;
  const front = depth / 2;

  return {
    white: [boxAt(width, height, depth - 24, 0, height / 2, -12, 5, 4)],
    steel: [
      boxAt(width - GAP * 2, height - 130, 24, 0, (height - 130) / 2, front - 12),
      ...bar(width - 140, 0, height - 150, front - 2),
    ],
    graphite: [boxAt(width - GAP * 2, 96, 26, 0, height - 60, front - 13, 4, 3)],
  };
}

/** Встраиваемый духовой шкаф. */
function oven() {
  const width = NICHE_WIDTH - 4;
  const height = 595;
  const depth = 550;
  const front = depth / 2;

  return {
    white: [boxAt(width, height, depth - 30, 0, height / 2, -15, 4, 4)],
    graphite: [
      // Стекло дверцы во всю ширину — главная деталь духовки
      boxAt(width - GAP * 2, height - 190, 30, 0, (height - 190) / 2 + 20, front - 15, 4, 3),
    ],
    steel: [
      boxAt(width, 120, 32, 0, height - 60, front - 16, 4, 3),
      ...bar(width - 120, 0, height - 150, front - 2),
      ...knobs(2, width - 200, 0, height - 60, front),
    ],
  };
}

/** Микроволновая печь: ставится на столешницу. */
function microwave() {
  const width = 500;
  const height = 300;
  const depth = 400;
  const front = depth / 2;

  return {
    white: [boxAt(width, height, depth - 20, 0, height / 2, -10, 5, 3)],
    graphite: [boxAt(width - 150, height - 70, 20, -40, height / 2, front - 10, 4, 3)],
    steel: [
      boxAt(130, height - 70, 22, width / 2 - 70, height / 2, front - 11, 4, 3),
      ...bar(120, -width / 2 + 90, height / 2, front - 1),
    ],
  };
}

/** Газовая варочная панель: горелки и чугунные решётки. */
function gasHob() {
  const width = 580;
  const depth = 510;
  const top = 14;

  const burners = [];
  const grates = [];
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      const x = dx * (width / 4);
      const z = dz * (depth / 4);
      burners.push(translate(cylinder(55, 22, 18), x, top + 11, z));
      burners.push(translate(cylinder(26, 34, 14), x, top + 17, z));
      // Решётка: две перекладины крестом над горелкой
      grates.push(translate(segmentedBox(190, 14, 22, 2), x, top + 32, z));
      grates.push(translate(segmentedBox(22, 14, 190, 2), x, top + 32, z));
    }
  }

  return {
    steel: [boxAt(width, top, depth, 0, top / 2, 0, 3, 3), ...burners],
    graphite: grates,
  };
}

/**
 * Купольная вытяжка: короб над плитой и труба к потолку.
 * Origin внизу купола — подъём задаёт mountHeightMm.
 */
function domeHood(widthMm) {
  const depth = 500;
  const skirt = 120;
  const domeHeight = 240;
  const ductHeight = 540;

  return {
    steel: [
      boxAt(widthMm, skirt, depth, 0, skirt / 2, 0, 5, 3),
      // Купол: сужение от фартука к трубе двумя ступенями
      boxAt(widthMm - 120, domeHeight, depth - 120, 0, skirt + domeHeight / 2, -20, 6, 3),
      boxAt(280, ductHeight, 300, 0, skirt + domeHeight + ductHeight / 2, -60, 4, 3),
    ],
    graphite: [boxAt(widthMm - 40, 26, depth - 40, 0, 13, 0, 3, 3)],
  };
}

/** Наклонная вытяжка: стеклянный экран под углом. */
function inclinedHood(widthMm) {
  const depth = 380;
  const bodyHeight = 180;
  const ductHeight = 620;
  const tilt = (34 * Math.PI) / 180;
  const screen = 420;

  // Экран висит на переднем крае корпуса: нижняя кромка ложится ровно
  // на отметку низа модели, иначе стекло уходит под пол
  const glass = rotateX(roundedBox(widthMm - 20, screen, 24, 6, 4), tilt);
  const halfDrop = (screen * Math.cos(tilt) + 24 * Math.sin(tilt)) / 2;
  translate(glass, 0, halfDrop, depth / 2 - 40);

  return {
    steel: [
      boxAt(widthMm, bodyHeight, depth, 0, bodyHeight / 2, -40, 5, 3),
      boxAt(240, ductHeight, 200, 0, bodyHeight + ductHeight / 2, -depth / 2 + 100, 4, 3),
    ],
    graphite: [glass],
  };
}

/**
 * Встраиваемая телескопическая вытяжка.
 * Прячется в навесной шкаф, наружу выходит только выдвижная панель.
 */
function builtInHood(widthMm) {
  const depth = 300;
  const height = 380;
  const slider = 120;

  return {
    white: [boxAt(widthMm, height, depth, 0, height / 2, -slider / 2, 4, 3)],
    steel: [
      boxAt(widthMm - 20, 90, slider, 0, 45, depth / 2 - 10, 4, 3),
      ...bar(widthMm - 180, 0, 45, depth / 2 + slider / 2 - 12),
    ],
    // Жироулавливающий фильтр смотрит вниз, на плиту: сверху вытяжка
    // закрыта шкафом, и деталь там не видна вообще
    graphite: [boxAt(widthMm - 60, 20, depth - 60, 0, 14, -slider / 2, 3, 3)],
  };
}

/**
 * `mountHeightMm` — высота установки низа модели над полом.
 * Вытяжка висит над столешницей: рабочая поверхность 858, зазор до
 * купола по нормам 650–750 мм.
 */
export const APPLIANCE_PRODUCTS = [
  {
    sku: 'TEST-APP-FRIDGE-600',
    role: 'fridge',
    name: 'Холодильник 600',
    category: 'Техника / Холодильники',
    basePriceCents: 5490000,
    stackable: false,
    build: () => fridge(600, 2000, 650),
  },
  {
    sku: 'TEST-APP-FRIDGE-900',
    role: 'fridge',
    name: 'Холодильник Side-by-Side 900',
    category: 'Техника / Холодильники',
    basePriceCents: 12990000,
    stackable: false,
    build: () => sideBySideFridge(900, 1850, 700),
  },
  {
    sku: 'TEST-APP-WASHER-600',
    role: 'washer',
    name: 'Стиральная машина 600',
    category: 'Техника / Стирка и мойка',
    basePriceCents: 3790000,
    build: washer,
  },
  {
    sku: 'TEST-APP-DISH-600',
    role: 'dishwasher',
    name: 'Посудомоечная машина 600',
    category: 'Техника / Стирка и мойка',
    basePriceCents: 4290000,
    build: dishwasher,
  },
  {
    sku: 'TEST-APP-OVEN-600',
    role: 'oven',
    name: 'Духовой шкаф 600',
    category: 'Техника / Встраиваемая',
    basePriceCents: 3590000,
    build: oven,
  },
  {
    sku: 'TEST-APP-HOB-GAS-580',
    role: 'hob',
    name: 'Варочная панель газовая 580',
    category: 'Техника / Встраиваемая',
    basePriceCents: 1890000,
    snapToWall: false,
    stackable: true,
    build: gasHob,
  },
  {
    sku: 'TEST-APP-MICRO-500',
    role: 'microwave',
    name: 'Микроволновая печь 500',
    category: 'Техника / Встраиваемая',
    basePriceCents: 1290000,
    snapToWall: false,
    stackable: true,
    build: microwave,
  },
  {
    sku: 'TEST-APP-HOOD-DOME-600',
    role: 'hood',
    name: 'Вытяжка купольная 600',
    category: 'Техника / Вытяжки',
    basePriceCents: 2290000,
    mountHeightMm: 1550,
    build: () => domeHood(600),
  },
  {
    sku: 'TEST-APP-HOOD-DOME-900',
    role: 'hood',
    name: 'Вытяжка купольная 900',
    category: 'Техника / Вытяжки',
    basePriceCents: 2990000,
    mountHeightMm: 1550,
    build: () => domeHood(900),
  },
  {
    sku: 'TEST-APP-HOOD-SLANT-600',
    role: 'hood',
    name: 'Вытяжка наклонная 600',
    category: 'Техника / Вытяжки',
    basePriceCents: 2690000,
    mountHeightMm: 1500,
    build: () => inclinedHood(600),
  },
  {
    sku: 'TEST-APP-HOOD-BUILTIN-600',
    role: 'hood',
    name: 'Вытяжка встраиваемая 600',
    category: 'Техника / Вытяжки',
    basePriceCents: 1690000,
    mountHeightMm: 1450,
    build: () => builtInHood(600),
  },
];
