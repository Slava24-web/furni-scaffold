/**
 * Каталог демо-тенанта `test`.
 *
 * Заменяет модели реального клиента, пока их нет: даёт пайплайну,
 * загрузчику и перф-гейту настоящие GLB с настоящей геометрией вместо
 * примитивов, собираемых в браузере. Это единственный источник правды
 * и для файлов моделей, и для сидов БД — расхождение между тем, что
 * лежит в хранилище, и тем, что записано в products, ловится сразу.
 *
 * Все размеры — миллиметры целыми (CLAUDE.md, конвенции).
 * Origin каждой модели — низ-центр габарита.
 */
import { cylinder, mergeGeometries, roundedBox, segmentedBox, translate } from './geometry.mjs';
import { KITCHEN_PRODUCTS } from './kitchen.mjs';
import { carcassPanels } from './carcass.mjs';
import { panelFacade } from './facade.mjs';

export const TEST_TENANT = {
  slug: 'test',
  name: 'Мебельный магазин «Тест»',
  allowedOrigins: ['http://localhost:5173', 'http://localhost:4173'],
};

/**
 * Материалы тенанта. `texture` ссылается на процедурную карту из
 * textures.mjs; без неё материал одноцветный.
 */
export const MATERIALS = {
  oak: {
    code: 'oak',
    // Цвет несёт текстура, поэтому множитель почти белый: иначе тон
    // перемножается дважды и дуб уходит в оранжевый пластик
    name: 'Дуб натуральный',
    baseColorFactor: [0.96, 0.94, 0.9, 1],
    roughness: 0.62,
    metallic: 0,
    texture: 'wood',
    priceModifierCents: 0,
  },
  white: {
    code: 'white',
    name: 'Белый ЛДСП',
    baseColorFactor: [0.92, 0.91, 0.89, 1],
    roughness: 0.55,
    metallic: 0,
    texture: null,
    priceModifierCents: 0,
  },
  graphite: {
    code: 'graphite',
    name: 'Графит',
    baseColorFactor: [0.19, 0.2, 0.22, 1],
    roughness: 0.5,
    metallic: 0,
    texture: null,
    priceModifierCents: 150000,
  },
  fabric: {
    code: 'fabric',
    name: 'Рогожка серая',
    baseColorFactor: [0.94, 0.95, 0.94, 1],
    roughness: 0.92,
    metallic: 0,
    texture: 'fabric',
    priceModifierCents: 0,
  },
  steel: {
    code: 'steel',
    name: 'Сталь матовая',
    baseColorFactor: [0.62, 0.64, 0.66, 1],
    roughness: 0.35,
    metallic: 0.9,
    texture: null,
    priceModifierCents: 0,
  },
  stone: {
    code: 'stone',
    name: 'Камень серый',
    baseColorFactor: [0.42, 0.43, 0.45, 1],
    roughness: 0.28,
    metallic: 0.05,
    texture: null,
    priceModifierCents: 320000,
  },
};

/** Вертикальная ручка-рейлинг. */
function verticalHandle(xMm, yMm, zMm, lengthMm) {
  return translate(cylinder(9, lengthMm, 10), xMm, yMm, zMm);
}

/** Горизонтальная ручка: цилиндр строится по оси Y, поэтому берём брусок. */
function horizontalHandle(xMm, yMm, zMm, lengthMm) {
  return translate(segmentedBox(lengthMm, 18, 18, 2), xMm, yMm, zMm);
}

function wardrobe() {
  const width = 1200;
  const height = 2200;
  const depth = 600;
  const plinth = 90;
  const corpusHeight = height - plinth;

  const doorWidth = width / 2 - 12;
  const doorHeight = corpusHeight - 40;
  const doorY = plinth + corpusHeight / 2;
  const doorZ = depth / 2 + 9;

  return {
    // Корпус из панелей, а не брусок: у шкафа появляются толщина
    // стенок, внутренний объём и полки
    white: carcassPanels(width, corpusHeight, depth, { bottomMm: plinth, shelves: 3 }),
    graphite: [translate(segmentedBox(width - 60, plinth, depth - 40, 2), 0, plinth / 2, 0)],
    oak: [
      ...panelFacade(doorWidth, doorHeight, 18, { x: -(doorWidth / 2 + 6), y: doorY, z: doorZ }),
      ...panelFacade(doorWidth, doorHeight, 18, { x: doorWidth / 2 + 6, y: doorY, z: doorZ }),
    ],
    steel: [
      verticalHandle(-30, doorY, doorZ + 20, 900),
      verticalHandle(30, doorY, doorZ + 20, 900),
    ],
  };
}

function sideboard() {
  const width = 1200;
  const height = 780;
  const depth = 450;
  const plinth = 80;
  const corpusHeight = height - plinth;
  const drawerHeight = corpusHeight / 3 - 14;

  const drawers = [];
  const handles = [];
  for (let i = 0; i < 3; i++) {
    const centerY = plinth + drawerHeight / 2 + 10 + i * (drawerHeight + 14);
    drawers.push(translate(roundedBox(width - 40, drawerHeight, 18, 5, 5), 0, centerY, depth / 2 + 9));
    handles.push(horizontalHandle(0, centerY + drawerHeight / 2 - 40, depth / 2 + 26, 320));
  }

  return {
    // Ящики занимают весь объём, полок внутри нет
    white: carcassPanels(width, corpusHeight, depth, { bottomMm: plinth }),
    graphite: [translate(segmentedBox(width - 60, plinth, depth - 40, 2), 0, plinth / 2, 0)],
    oak: drawers,
    steel: handles,
  };
}

function table() {
  const width = 1400;
  const depth = 800;
  const topThickness = 40;
  const legHeight = 720 - topThickness;
  const inset = 90;

  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      legs.push(
        translate(
          cylinder(32, legHeight, 14),
          sx * (width / 2 - inset),
          legHeight / 2,
          sz * (depth / 2 - inset),
        ),
      );
    }
  }

  return {
    oak: [translate(roundedBox(width, topThickness, depth, 12, 8), 0, legHeight + topThickness / 2, 0)],
    steel: legs,
  };
}

function chair() {
  const seatHeight = 450;
  const seatThickness = 90;
  const legHeight = seatHeight - seatThickness;

  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      legs.push(translate(cylinder(18, legHeight, 12), sx * 180, legHeight / 2, sz * 180));
    }
  }

  return {
    fabric: [
      translate(roundedBox(460, seatThickness, 460, 24, 8), 0, legHeight + seatThickness / 2, 0),
      translate(roundedBox(420, 480, 70, 24, 8), 0, seatHeight + 240, -195),
    ],
    steel: legs,
  };
}

function sofa() {
  const width = 2040;
  const depth = 900;
  const baseHeight = 320;
  const legHeight = 120;
  const armWidth = 200;

  const seatWidth = (width - armWidth * 2) / 3 - 20;
  const cushions = [];
  const backs = [];
  for (let i = 0; i < 3; i++) {
    const centerX = -(width - armWidth * 2) / 2 + seatWidth / 2 + 10 + i * (seatWidth + 20);
    // Сегментов больше, чем у корпусов: подушки — самая тяжёлая часть модели,
    // на них и проверяется, что LOD-упрощение действительно режет геометрию
    cushions.push(translate(roundedBox(seatWidth, 170, 720, 55, 10), centerX, legHeight + baseHeight + 85, 40));
    backs.push(translate(roundedBox(seatWidth, 430, 190, 55, 10), centerX, legHeight + baseHeight + 300, -330));
  }

  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      legs.push(translate(cylinder(22, legHeight, 10), sx * (width / 2 - 140), legHeight / 2, sz * (depth / 2 - 140)));
    }
  }

  return {
    fabric: [
      translate(segmentedBox(width, baseHeight, depth, 4), 0, legHeight + baseHeight / 2, 0),
      translate(roundedBox(armWidth, 550, depth, 60, 10), -(width / 2 - armWidth / 2), legHeight + 275, 0),
      translate(roundedBox(armWidth, 550, depth, 60, 10), width / 2 - armWidth / 2, legHeight + 275, 0),
      ...cushions,
      ...backs,
    ],
    steel: legs,
  };
}

/**
 * Изделия тенанта. `build()` возвращает карту «материал -> список деталей»:
 * детали одного материала сливаются в один примитив, иначе каждая ножка
 * стоила бы отдельного draw call.
 *
 * `mountHeightMm` — высота установки низа модели: верхние шкафы висят,
 * а не стоят на полу. `snapToWall` — участвует ли объект в привязке
 * к стенам.
 */
const FURNITURE = [
  {
    sku: 'TEST-WRD-1200',
    name: 'Шкаф «Орион» 1200',
    category: 'Шкафы',
    type: 'static',
    basePriceCents: 5490000,
    build: wardrobe,
  },
  {
    sku: 'TEST-SBD-1200',
    name: 'Комод «Орион» 1200',
    category: 'Комоды',
    type: 'static',
    basePriceCents: 2790000,
    build: sideboard,
  },
  {
    sku: 'TEST-TBL-1400',
    name: 'Стол «Норд» 1400',
    category: 'Столы',
    type: 'static',
    basePriceCents: 3190000,
    build: table,
  },
  {
    sku: 'TEST-CHR-460',
    name: 'Стул «Норд»',
    category: 'Стулья',
    type: 'static',
    basePriceCents: 890000,
    build: chair,
  },
  {
    sku: 'TEST-SFA-2040',
    name: 'Диван «Ленокс» 2040',
    category: 'Диваны',
    type: 'static',
    basePriceCents: 8990000,
    build: sofa,
  },
];

/**
 * Слоты отделки по умолчанию.
 *
 * Слот привязан к ИМЕНИ материала в модели: пайплайн сохраняет их на всех
 * LOD, поэтому клиент находит нужные меши по нему и подменяет материал.
 * Без слотов отделка была бы запечена в геометрию намертво.
 */
const FACADE_FINISH = {
  code: 'facade',
  label: 'Фасад',
  slotMaterial: 'oak',
  options: ['oak', 'white', 'graphite'],
};

const UPHOLSTERY_FINISH = {
  code: 'upholstery',
  label: 'Обивка',
  slotMaterial: 'fabric',
  options: ['fabric', 'graphite', 'oak'],
};

const WORKTOP_FINISH = {
  code: 'worktop',
  label: 'Столешница',
  slotMaterial: 'stone',
  options: ['stone', 'graphite', 'white'],
};

/**
 * Слоты отделки по фактическому составу модели.
 *
 * Слот существует, только если в модели действительно есть материал,
 * который он подменяет: у мойки нет фасада, и предлагать выбор его
 * отделки значит обещать то, чего не произойдёт.
 */
export function finishesFor(materialCodes) {
  const present = new Set(materialCodes);
  return [FACADE_FINISH, UPHOLSTERY_FINISH, WORKTOP_FINISH].filter((finish) =>
    present.has(finish.slotMaterial),
  );
}

/**
 * Полный каталог: корпусная мебель плюс кухонные модули и детали.
 * Значения по умолчанию проставляются здесь, чтобы описания изделий
 * не повторяли одно и то же.
 */
export const PRODUCTS = [...FURNITURE, ...KITCHEN_PRODUCTS].map((product) => ({
  type: 'static',
  mountHeightMm: 0,
  snapToWall: true,
  // По умолчанию объект на другие не ставится: корпусная мебель стоит
  // на полу, и «взлёт» на случайную опору был бы неожиданностью
  stackable: false,
  ...product,
}));

/** Слияние деталей одного материала в одну геометрию. */
export function buildProductGeometry(product) {
  const parts = product.build();
  return Object.entries(parts)
    .filter(([, pieces]) => pieces.length > 0)
    .map(([material, pieces]) => ({ material, geometry: mergeGeometries(pieces) }));
}
