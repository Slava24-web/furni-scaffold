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
 * Полный каталог: корпусная мебель, кухонные модули и техника.
 * Значения по умолчанию проставляются здесь, чтобы описания изделий
 * не повторяли одно и то же.
 */
export const PRODUCTS = [...FURNITURE, ...KITCHEN_PRODUCTS, ...APPLIANCE_PRODUCTS].map((product) => ({
  type: 'static',
  mountHeightMm: 0,
  snapToWall: true,
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
