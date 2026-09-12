/**
 * Кухонные модули и детали демо-тенанта `test`.
 *
 * Кухня собирается из отдельных объектов, поэтому здесь и готовые модули
 * (шкаф с фасадом и ручкой), и россыпь деталей — фасады, дверцы, фронты
 * ящиков, ручки, столешницы. Из них можно собрать гарнитур перетаскиванием.
 *
 * Размеры взяты из ходового стандарта корпусной кухни:
 *   цоколь 100, корпус нижнего 720, столешница 38 -> рабочая 858
 *   глубина нижнего 560, верхнего 320
 *   низ верхнего ряда 1450 от пола
 * Всё в миллиметрах целыми (CLAUDE.md).
 */
import { cylinder, mergeGeometries, roundedBox, segmentedBox, translate } from './geometry.mjs';
import { carcassPanels, openBoxPanels } from './carcass.mjs';
import { flatFacade, panelFacade } from './facade.mjs';

export const PLINTH = 100;
export const BASE_CARCASS = 720;
export const WORKTOP_THICKNESS = 38;
export const BASE_DEPTH = 560;
export const WALL_DEPTH = 320;
export const WALL_MOUNT_HEIGHT = 1450;
export const WORKTOP_HEIGHT = PLINTH + BASE_CARCASS;
export const FACADE_THICKNESS = 18;
export const FACADE_GAP = 4;

/**
 * Ручка-скоба: две стойки и рейлинг между ними.
 * Строится в плоскости фасада, вынесена вперёд по Z.
 */
function bracketHandle(centreXMm, centreYMm, frontZMm, spanMm = 224) {
  const postHeight = 32;
  const parts = [];
  for (const side of [-1, 1]) {
    parts.push(
      translate(
        segmentedBox(14, 14, postHeight, 1),
        centreXMm + (side * spanMm) / 2,
        centreYMm,
        frontZMm + postHeight / 2,
      ),
    );
  }
  // Рейлинг: цилиндр строится вдоль Y, поэтому берём брусок со скруглением
  parts.push(
    translate(
      roundedBox(spanMm + 14, 16, 16, 8, 4),
      centreXMm,
      centreYMm,
      frontZMm + postHeight,
    ),
  );
  return parts;
}

/**
 * Фасад с зазором по периметру. Возвращает список деталей: у филёнчатого
 * фасада их пять, у плоского фронта ящика одна.
 */
function facade(widthMm, heightMm, centreYMm, frontZMm) {
  return panelFacade(widthMm - FACADE_GAP * 2, heightMm, FACADE_THICKNESS, {
    x: 0,
    y: centreYMm,
    z: frontZMm,
  });
}

function roundedBoxAt(w, h, d, x, y, z, radius = 3, segments = 3) {
  return translate(roundedBox(w, h, d, radius, segments), x, y, z);
}

/**
 * Корпус шкафа из панелей: боковины, дно, крышка, задняя стенка и полки.
 * Сплошной брусок читался снаружи как монолит и не имел толщины стенок.
 */
function carcass(widthMm, heightMm, depthMm, bottomMm, shelves = 1) {
  return carcassPanels(widthMm, heightMm, depthMm, { bottomMm, shelves });
}

function plinth(widthMm, depthMm) {
  return translate(segmentedBox(widthMm - 20, PLINTH, depthMm - 60, 1), 0, PLINTH / 2, -10);
}

/** Нижний шкаф с распашным фасадом. */
function baseCabinet(widthMm) {
  const facadeZ = BASE_DEPTH / 2 + FACADE_THICKNESS / 2;
  const facadeY = PLINTH + BASE_CARCASS / 2;

  return {
    white: carcass(widthMm, BASE_CARCASS, BASE_DEPTH, PLINTH),
    graphite: [plinth(widthMm, BASE_DEPTH)],
    oak: facade(widthMm, BASE_CARCASS - FACADE_GAP * 2, facadeY, facadeZ),
    steel: bracketHandle(0, PLINTH + BASE_CARCASS - 90, facadeZ + FACADE_THICKNESS / 2),
  };
}

/** Раскладка ящиков нижнего модуля: высота фронта и его центр. */
function baseDrawerLayout(widthMm) {
  const drawerHeight = (BASE_CARCASS - FACADE_GAP * 4) / 3;
  const facadeZ = BASE_DEPTH / 2 + FACADE_THICKNESS / 2;

  return Array.from({ length: 3 }, (_, index) => ({
    widthMm,
    frontHeight: drawerHeight,
    centreY: PLINTH + FACADE_GAP + drawerHeight / 2 + index * (drawerHeight + FACADE_GAP),
    frontZ: facadeZ,
  }));
}

/** Нижний шкаф с тремя ящиками. Корпус неподвижен, ящики — отдельные узлы. */
function baseDrawers(widthMm) {
  return {
    // У шкафа с ящиками полок нет: внутренний объём занимают короба
    white: carcass(widthMm, BASE_CARCASS, BASE_DEPTH, PLINTH, 0),
    graphite: [plinth(widthMm, BASE_DEPTH)],
  };
}

/**
 * Ящики нижнего модуля как подвижные детали: фронт, ручка и короб.
 * Короб строится всегда — без него выдвинутый ящик выглядит
 * оторвавшимся фасадом.
 */
function baseDrawerParts(widthMm) {
  return baseDrawerLayout(widthMm).map((drawer) => {
    const boxDepth = BASE_DEPTH - 60;
    const boxHeight = drawer.frontHeight - 30;
    const bottomMm = drawer.centreY - drawer.frontHeight / 2 + 14;
    // Перед короба прижат к тыльной стороне фронта
    const centreZ = BASE_DEPTH / 2 - boxDepth / 2;

    return {
      travelMm: Math.round(boxDepth * 0.72),
      parts: {
        oak: facade(widthMm, drawer.frontHeight, drawer.centreY, drawer.frontZ),
        white: openBoxPanels(widthMm - 80, boxHeight, boxDepth, { bottomMm }).map((part) =>
          translate(part, 0, 0, centreZ),
        ),
        steel: bracketHandle(0, drawer.centreY, drawer.frontZ + FACADE_THICKNESS / 2, 160),
      },
    };
  });
}

/** Верхний шкаф. Origin остаётся внизу модели, подъём задаёт mountHeightMm. */
function wallCabinet(widthMm, heightMm) {
  const facadeZ = WALL_DEPTH / 2 + FACADE_THICKNESS / 2;

  return {
    white: carcass(widthMm, heightMm, WALL_DEPTH, 0),
    oak: facade(widthMm, heightMm - FACADE_GAP * 2, heightMm / 2, facadeZ),
    steel: bracketHandle(0, 90, facadeZ + FACADE_THICKNESS / 2),
  };
}

/** Пенал: колонна во всю высоту с двумя фасадами. */
function tallCabinet(widthMm) {
  const height = 2140;
  const facadeZ = BASE_DEPTH / 2 + FACADE_THICKNESS / 2;
  const lower = 1300;
  const upper = height - lower - FACADE_GAP * 3;

  return {
    // Пенал высокий: полок больше
    white: carcass(widthMm, height, BASE_DEPTH, PLINTH, 4),
    graphite: [plinth(widthMm, BASE_DEPTH)],
    oak: [
      ...facade(widthMm, lower, PLINTH + FACADE_GAP + lower / 2, facadeZ),
      ...facade(widthMm, upper, PLINTH + lower + FACADE_GAP * 2 + upper / 2, facadeZ),
    ],
    steel: [
      ...bracketHandle(0, PLINTH + lower - 60, facadeZ + FACADE_THICKNESS / 2),
      ...bracketHandle(0, PLINTH + lower + FACADE_GAP * 2 + 60, facadeZ + FACADE_THICKNESS / 2),
    ],
  };
}

/**
 * Столешница с пристенным плинтусом.
 *
 * Плинтус закрывает стык со стеной: без него столешница выглядит
 * положенной сверху доской, а не частью кухни.
 */
function worktop(widthMm) {
  const depth = 600;
  const offsetZ = (depth - BASE_DEPTH) / 2 - 20;
  const skirtHeight = 60;
  const skirtThickness = 18;

  return {
    stone: [
      translate(roundedBox(widthMm, WORKTOP_THICKNESS, depth, 4, 3), 0, WORKTOP_THICKNESS / 2, offsetZ),
      translate(
        segmentedBox(widthMm, skirtHeight, skirtThickness, 1),
        0,
        WORKTOP_THICKNESS + skirtHeight / 2,
        offsetZ - (depth - skirtThickness) / 2,
      ),
    ],
  };
}

/**
 * Врезная мойка с однорычажным смесителем.
 *
 * Ставится на столешницу: собственной отметки нет, высоту даёт опора
 * под указателем.
 */
function sink() {
  const width = 500;
  const depth = 440;
  const wallHeight = 170;
  const wall = 12;
  const rim = 26;

  const parts = [];
  // Дно чаши и четыре борта
  parts.push(translate(segmentedBox(width, wall, depth, 1), 0, wall / 2, 0));
  for (const side of [-1, 1]) {
    parts.push(
      translate(segmentedBox(wall, wallHeight, depth, 1), (side * (width - wall)) / 2, wallHeight / 2, 0),
    );
    parts.push(
      translate(
        segmentedBox(width - wall * 2, wallHeight, wall, 1),
        0,
        wallHeight / 2,
        (side * (depth - wall)) / 2,
      ),
    );
  }

  // Бортик по периметру: им мойка ложится на столешницу
  parts.push(
    translate(roundedBox(width + rim * 2, 10, depth + rim * 2, 3, 2), 0, wallHeight + 5, 0),
  );

  // Смеситель: стойка и излив
  const tapZ = -(depth / 2 + rim / 2);
  parts.push(translate(cylinder(19, 300, 12), 0, wallHeight + 150, tapZ));
  parts.push(translate(roundedBox(24, 24, 190, 12, 4), 0, wallHeight + 290, tapZ + 95));

  return { steel: parts };
}

/**
 * Варочная панель: стеклянная плита с конфорками.
 * Как и мойка, встаёт на ту поверхность, в которую целятся.
 */
function hob() {
  const width = 580;
  const depth = 510;

  const glass = [translate(roundedBox(width, 12, depth, 3, 2), 0, 6, 0)];
  const burners = [];
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      burners.push(
        translate(cylinder(88, 5, 20), dx * (width / 4), 14, dz * (depth / 4)),
      );
    }
  }

  return { graphite: glass, steel: burners };
}

/** Отдельная деталь: фасад или дверца с ручкой. */
function loosePanel(widthMm, heightMm, withHandle) {
  const parts = {
    oak: panelFacade(widthMm, heightMm, FACADE_THICKNESS, {
      x: 0,
      y: heightMm / 2,
      z: 0,
    }),
  };
  if (withHandle) {
    parts.steel = bracketHandle(0, heightMm - 90, FACADE_THICKNESS / 2);
  }
  return parts;
}

/** Ящик как деталь: короб с фронтом. */
function drawerBox(widthMm) {
  const height = 176;
  const depth = 500;
  return {
    // Настоящий короб: боковины, дно и задний борт, перед закрыт фасадом
    white: openBoxPanels(widthMm - 40, height, depth, { bottomMm: 0 }),
    oak: flatFacade(widthMm, height, FACADE_THICKNESS, { x: 0, y: height / 2, z: depth / 2 - 10 }),
    steel: bracketHandle(0, height / 2, depth / 2 - 10 + FACADE_THICKNESS / 2, 160),
  };
}

/**
 * Ручка как отдельная позиция каталога.
 * Центр рейлинга поднят на его полутолщину: origin модели обязан лежать
 * на низе габарита, иначе деталь висит над полом (CLAUDE.md, конвенции).
 */
function handle(spanMm) {
  return { steel: bracketHandle(0, 8, 0, spanMm) };
}

/**
 * `mountHeightMm` — высота установки низа модели над полом.
 * `snapToWall` — участвует ли в привязке к стенам: россыпь мелких
 * деталей к стене не липнет, иначе ручка прыгала бы через всю кухню.
 * `stackable` — можно ли ставить на другие объекты. Корпусные модули
 * стоят на полу или висят на своей отметке, мелочь кладут на столешницу.
 */
export const KITCHEN_PRODUCTS = [
  {
    sku: 'TEST-KIT-BASE-600',
    name: 'Кухня: нижний шкаф 600',
    category: 'Кухня / Нижние модули',
    basePriceCents: 890000,
    mountHeightMm: 0,
    snapToWall: true,
    build: () => baseCabinet(600),
  },
  {
    sku: 'TEST-KIT-BASE-800',
    name: 'Кухня: нижний шкаф 800',
    category: 'Кухня / Нижние модули',
    basePriceCents: 1090000,
    mountHeightMm: 0,
    snapToWall: true,
    build: () => baseCabinet(800),
  },
  {
    sku: 'TEST-KIT-DRW-600',
    name: 'Кухня: нижний шкаф с ящиками 600',
    category: 'Кухня / Нижние модули',
    basePriceCents: 1290000,
    mountHeightMm: 0,
    snapToWall: true,
    build: () => baseDrawers(600),
    drawers: () => baseDrawerParts(600),
  },
  {
    sku: 'TEST-KIT-WALL-600',
    name: 'Кухня: верхний шкаф 600',
    category: 'Кухня / Верхние модули',
    basePriceCents: 690000,
    mountHeightMm: WALL_MOUNT_HEIGHT,
    snapToWall: true,
    build: () => wallCabinet(600, 720),
  },
  {
    sku: 'TEST-KIT-WALL-800',
    name: 'Кухня: верхний шкаф 800',
    category: 'Кухня / Верхние модули',
    basePriceCents: 790000,
    mountHeightMm: WALL_MOUNT_HEIGHT,
    snapToWall: true,
    build: () => wallCabinet(800, 720),
  },
  {
    sku: 'TEST-KIT-TALL-600',
    name: 'Кухня: пенал 600',
    category: 'Кухня / Нижние модули',
    basePriceCents: 1890000,
    mountHeightMm: 0,
    snapToWall: true,
    build: () => tallCabinet(600),
  },
  {
    sku: 'TEST-KIT-TOP-1200',
    name: 'Кухня: столешница 1200',
    category: 'Кухня / Столешницы',
    basePriceCents: 540000,
    mountHeightMm: WORKTOP_HEIGHT,
    snapToWall: true,
    build: () => worktop(1200),
  },
  {
    sku: 'TEST-KIT-TOP-2000',
    name: 'Кухня: столешница 2000',
    category: 'Кухня / Столешницы',
    basePriceCents: 820000,
    mountHeightMm: WORKTOP_HEIGHT,
    snapToWall: true,
    build: () => worktop(2000),
  },
  {
    sku: 'TEST-KIT-SINK-500',
    name: 'Кухня: мойка 500 со смесителем',
    category: 'Кухня / Техника и мойки',
    basePriceCents: 1450000,
    mountHeightMm: 0,
    snapToWall: false,
    stackable: true,
    build: sink,
  },
  {
    sku: 'TEST-KIT-HOB-580',
    name: 'Кухня: варочная панель 580',
    category: 'Кухня / Техника и мойки',
    basePriceCents: 2190000,
    mountHeightMm: 0,
    snapToWall: false,
    stackable: true,
    build: hob,
  },
  {
    sku: 'TEST-KIT-FCD-600',
    name: 'Кухня: фасад 600×716',
    category: 'Кухня / Детали',
    basePriceCents: 240000,
    mountHeightMm: PLINTH,
    snapToWall: false,
    stackable: true,
    build: () => loosePanel(596, 716, false),
  },
  {
    sku: 'TEST-KIT-DOOR-600',
    name: 'Кухня: дверца 600×716 с ручкой',
    category: 'Кухня / Детали',
    basePriceCents: 290000,
    mountHeightMm: PLINTH,
    snapToWall: false,
    stackable: true,
    build: () => loosePanel(596, 716, true),
  },
  {
    sku: 'TEST-KIT-DRWBOX-600',
    name: 'Кухня: ящик 600',
    category: 'Кухня / Детали',
    basePriceCents: 320000,
    mountHeightMm: PLINTH,
    snapToWall: false,
    stackable: true,
    build: () => drawerBox(596),
  },
  {
    sku: 'TEST-KIT-HANDLE-224',
    name: 'Кухня: ручка-скоба 224',
    category: 'Кухня / Детали',
    basePriceCents: 45000,
    mountHeightMm: 0,
    snapToWall: false,
    stackable: true,
    build: () => handle(224),
  },
];

/** Слияние деталей одного материала — по одному примитиву на материал. */
export function mergeParts(parts) {
  return Object.entries(parts)
    .filter(([, pieces]) => pieces.length > 0)
    .map(([material, pieces]) => ({ material, geometry: mergeGeometries(pieces) }));
}
