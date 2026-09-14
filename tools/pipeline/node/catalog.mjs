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
import { mergeGeometries } from './geometry.mjs';
import { KITCHEN_PRODUCTS } from './kitchen.mjs';
import { APPLIANCE_PRODUCTS } from './appliances.mjs';
import { FURNITURE } from './furniture.mjs';

export const TEST_TENANT = {
  slug: 'test',
  name: 'Мебельный магазин «Тест»',
  allowedOrigins: ['http://localhost:5173', 'http://localhost:4173'],
};

/**
 * Материалы тенанта. `texture` ссылается на процедурную карту из
 * textures.mjs; без неё материал одноцветный.
 *
 * `baseColorFactor` — ЛИНЕЙНОЕ пространство, как требует glTF. Это не
 * тот же набор чисел, что в CSS: тёмные цвета, записанные как sRGB,
 * выходят на экран вдвое светлее. Именно так «Графит» рендерился
 * средне-серым — 0.19 линейных это 0.47 после гамма-кодирования.
 * Соответствие sRGB указано рядом с каждым цветом.
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
    // sRGB #edeae5
    baseColorFactor: [0.8469, 0.8228, 0.7835, 1],
    roughness: 0.55,
    metallic: 0,
    texture: null,
    priceModifierCents: 0,
  },
  graphite: {
    code: 'graphite',
    name: 'Графит',
    // sRGB #31343a
    baseColorFactor: [0.0307, 0.0343, 0.0423, 1],
    roughness: 0.5,
    metallic: 0,
    texture: null,
    priceModifierCents: 150000,
  },
  fabric: {
    code: 'fabric',
    name: 'Рогожка серая',
    // sRGB #d8d6d0: рогожка светлая, но не белая
    baseColorFactor: [0.6867, 0.6724, 0.6308, 1],
    roughness: 0.92,
    metallic: 0,
    texture: 'fabric',
    priceModifierCents: 0,
  },
  steel: {
    code: 'steel',
    name: 'Сталь матовая',
    // sRGB #9aa2ad
    baseColorFactor: [0.3231, 0.3613, 0.4179, 1],
    roughness: 0.35,
    metallic: 0.9,
    texture: null,
    priceModifierCents: 0,
  },
  /**
   * Камень: общая линейка для столешницы и чаши мойки.
   *
   * Общая намеренно. Мойка врезана в столешницу, и самый ходовой заказ —
   * когда они одного цвета: получается монолитная плоскость без стыка
   * по тону. Отдельные палитры этого не позволяли бы в принципе.
   *
   * Смеситель красится своей линейкой: он металлический, и гранитных
   * кранов не бывает.
   */
  sinkSteel: {
    code: 'sinkSteel',
    name: 'Нержавеющая сталь',
    // sRGB #c3c8cc
    baseColorFactor: [0.5457, 0.5776, 0.6038, 1],
    roughness: 0.34,
    metallic: 0.85,
    texture: null,
    priceModifierCents: 0,
  },
  stoneGraphite: {
    code: 'stoneGraphite',
    name: 'Гранит графит',
    // sRGB #3a3d42
    baseColorFactor: [0.0423, 0.0467, 0.0545, 1],
    roughness: 0.62,
    metallic: 0,
    texture: null,
    priceModifierCents: 180000,
  },
  stoneSand: {
    code: 'stoneSand',
    name: 'Гранит песок',
    // sRGB #c4b49a
    baseColorFactor: [0.552, 0.4564, 0.3231, 1],
    roughness: 0.66,
    metallic: 0,
    texture: null,
    priceModifierCents: 180000,
  },
  stoneWhite: {
    code: 'stoneWhite',
    name: 'Гранит белый',
    // sRGB #e8e6e1
    baseColorFactor: [0.807, 0.7913, 0.7529, 1],
    roughness: 0.6,
    metallic: 0,
    texture: null,
    priceModifierCents: 180000,
  },
  stoneTerracotta: {
    code: 'stoneTerracotta',
    name: 'Гранит терракота',
    // sRGB #9c5f46
    baseColorFactor: [0.3325, 0.1144, 0.0612, 1],
    roughness: 0.64,
    metallic: 0,
    texture: null,
    priceModifierCents: 240000,
  },
  tapChrome: {
    code: 'tapChrome',
    name: 'Смеситель: хром',
    // sRGB #d5d9dd
    baseColorFactor: [0.6654, 0.6939, 0.7231, 1],
    roughness: 0.12,
    metallic: 1,
    texture: null,
    priceModifierCents: 0,
  },
  tapBlack: {
    code: 'tapBlack',
    name: 'Смеситель: чёрный матовый',
    // sRGB #2a2c30
    baseColorFactor: [0.0232, 0.0252, 0.0296, 1],
    roughness: 0.55,
    metallic: 0.2,
    texture: null,
    priceModifierCents: 120000,
  },
  tapBrass: {
    code: 'tapBrass',
    name: 'Смеситель: латунь',
    // sRGB #b5913f
    baseColorFactor: [0.4621, 0.2831, 0.0497, 1],
    roughness: 0.25,
    metallic: 1,
    texture: null,
    priceModifierCents: 190000,
  },
  tapCopper: {
    code: 'tapCopper',
    name: 'Смеситель: медь',
    // sRGB #a5623c
    baseColorFactor: [0.3763, 0.1221, 0.0452, 1],
    roughness: 0.28,
    metallic: 1,
    texture: null,
    priceModifierCents: 190000,
  },
  tapWhite: {
    code: 'tapWhite',
    name: 'Смеситель: белый матовый',
    // sRGB #eceae6
    baseColorFactor: [0.8388, 0.8228, 0.7913, 1],
    roughness: 0.5,
    metallic: 0.1,
    texture: null,
    priceModifierCents: 120000,
  },
  stone: {
    code: 'stone',
    name: 'Камень серый',
    // sRGB #6b6d70
    baseColorFactor: [0.147, 0.1529, 0.162, 1],
    roughness: 0.28,
    metallic: 0.05,
    texture: null,
    priceModifierCents: 320000,
  },
};


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

/**
 * Столешница и чаша делят линейку камня.
 *
 * Мойка врезана в столешницу, и самый ходовой заказ — один цвет на обе:
 * плоскость читается монолитной. Поэтому четыре цвета из пяти у них
 * общие, а различаются только те, которых в другой роли не бывает:
 * серый камень столешницы и нержавеющая сталь чаши.
 */
const STONE_COLOURS = ['stoneGraphite', 'stoneSand', 'stoneWhite', 'stoneTerracotta'];

const WORKTOP_FINISH = {
  code: 'worktop',
  label: 'Столешница',
  slotMaterial: 'stone',
  options: ['stone', ...STONE_COLOURS],
};

/** Чаша и кран красятся раздельно: это два разных заказа. */
const SINK_FINISH = {
  code: 'sink',
  label: 'Чаша',
  slotMaterial: 'sinkSteel',
  options: ['sinkSteel', ...STONE_COLOURS],
};

const TAP_FINISH = {
  code: 'tap',
  label: 'Смеситель',
  slotMaterial: 'tapChrome',
  options: ['tapChrome', 'tapBlack', 'tapBrass', 'tapCopper', 'tapWhite'],
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
  return [FACADE_FINISH, UPHOLSTERY_FINISH, WORKTOP_FINISH, SINK_FINISH, TAP_FINISH].filter(
    (finish) => present.has(finish.slotMaterial),
  );
}

/**
 * Полный каталог: корпусная мебель, кухонные модули и техника.
 * Значения по умолчанию проставляются здесь, чтобы описания изделий
 * не повторяли одно и то же.
 */
export const PRODUCTS = [...FURNITURE, ...KITCHEN_PRODUCTS, ...APPLIANCE_PRODUCTS].map((product) => ({
  type: 'static',
  mountHeightMm: 0,
  snapToWall: true,
  // Насколько изделие утоплено в опору. Врезается только мойка,
  // остальное стоит сверху
  recessMm: 0,
  // По умолчанию объект на другие не ставится: корпусная мебель стоит
  // на полу, и «взлёт» на случайную опору был бы неожиданностью
  stackable: false,
  ...product,
}));

/** Слияние деталей одного материала в одну геометрию. */
function mergeByMaterial(parts) {
  return Object.entries(parts)
    .filter(([, pieces]) => pieces.length > 0)
    .map(([material, pieces]) => ({ material, geometry: mergeGeometries(pieces) }));
}

/** Неподвижная часть изделия. */
export function buildProductGeometry(product) {
  return mergeByMaterial(product.build());
}

/**
 * Листовые детали изделия для карты раскроя.
 *
 * Собираются ДО слияния по материалам: после него отдельных деталей уже
 * нет. Метку ставит тот, кто деталь построил, — ручки, ножки и стекло
 * её не несут и в раскрой не попадают.
 */
export function buildProductPanels(product) {
  const panels = [];
  const collect = (parts) => {
    for (const [material, pieces] of Object.entries(parts)) {
      for (const piece of pieces) {
        if (piece.panel) panels.push({ material, ...piece.panel });
      }
    }
  };

  collect(product.build());
  for (const drawer of product.drawers?.() ?? []) collect(drawer.parts);
  for (const door of product.doors?.() ?? []) collect(door.parts);
  return panels;
}

/**
 * Подвижные ящики изделия.
 *
 * Каждый ящик уезжает в GLB отдельным узлом: слить его с корпусом
 * значит лишить возможности выдвинуть. Имя узла — адрес для вьюера,
 * ход записан в extras, потому что он свойство изделия, а не сцены.
 */
export function buildProductDrawers(product) {
  return (product.drawers?.() ?? []).map((drawer, index) => ({
    name: `drawer:${index}`,
    travelMm: Math.round(drawer.travelMm),
    groups: mergeByMaterial(drawer.parts),
  }));
}

/**
 * Распашные дверцы изделия.
 *
 * Как и ящик, дверца уезжает в GLB отдельным узлом: слить её с корпусом
 * значит лишить возможности открыть. В extras едет точка навески —
 * вокруг неё вьюер и поворачивает полотно. Считать её на глаз нельзя:
 * дверца повернётся вокруг своего центра и уедет сквозь стенку.
 */
export function buildProductDoors(product) {
  return (product.doors?.() ?? []).map((door, index) => ({
    name: `door:${index}`,
    hingeXMm: Math.round(door.hingeXMm),
    hingeZMm: Math.round(door.hingeZMm),
    /** Знак задаёт сторону распахивания: слева петли или справа */
    maxAngleDeg: Math.round(door.maxAngleDeg ?? 100),
    groups: mergeByMaterial(door.parts),
  }));
}
