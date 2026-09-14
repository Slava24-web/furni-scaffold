/**
 * Кухонные изделия демо-тенанта `test`.
 *
 * Кухня собирается из отдельных объектов, поэтому здесь и готовые модули
 * (шкаф с фасадом и ручкой), и россыпь деталей — фасады, дверцы, фронты
 * ящиков, ручки, столешницы. Из них можно собрать гарнитур перетаскиванием.
 *
 * Сама геометрия деталей — в kitchenParts.mjs. Константы стандарта
 * реэкспортируются оттуда: на них ссылаются техника и тесты.
 */
import {
  doubleSink,
  drainerSink,
  roundSink,
  squareSink,
  SINK_CUTOUT,
  SINK_RECESS,
} from './sinks.mjs';
import {
  baseCabinet,
  baseCabinetDoor,
  baseDrawers,
  baseDrawerParts,
  drawerBox,
  handle,
  hob,
  loosePanel,
  tallCabinet,
  tallCabinetDoors,
  wallCabinet,
  wallCabinetDoor,
  worktop,
  worktopSlab,
} from './kitchenParts.mjs';

// Константы стандарта нужны и здесь, и снаружи (техника, тесты):
// импортируются для таблицы изделий и реэкспортируются наружу
import {
  PLINTH,
  BASE_CARCASS,
  WORKTOP_THICKNESS,
  BASE_DEPTH,
  WALL_DEPTH,
  WALL_MOUNT_HEIGHT,
  WORKTOP_HEIGHT,
  FACADE_THICKNESS,
  FACADE_GAP,
} from './kitchenParts.mjs';

export {
  PLINTH,
  BASE_CARCASS,
  WORKTOP_THICKNESS,
  BASE_DEPTH,
  WALL_DEPTH,
  WALL_MOUNT_HEIGHT,
  WORKTOP_HEIGHT,
  FACADE_THICKNESS,
  FACADE_GAP,
};
export { mergeParts } from './kitchenParts.mjs';

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
    resize: { minWidthMm: 300, maxWidthMm: 1000 },
    role: 'base',
    name: 'Кухня: нижний шкаф 600',
    category: 'Кухня / Нижние модули',
    basePriceCents: 890000,
    mountHeightMm: 0,
    snapToWall: true,
    build: () => baseCabinet(600),
    doors: () => baseCabinetDoor(600),
  },
  {
    sku: 'TEST-KIT-BASE-800',
    resize: { minWidthMm: 400, maxWidthMm: 1200 },
    role: 'base',
    name: 'Кухня: нижний шкаф 800',
    category: 'Кухня / Нижние модули',
    basePriceCents: 1090000,
    mountHeightMm: 0,
    snapToWall: true,
    build: () => baseCabinet(800),
    doors: () => baseCabinetDoor(800),
  },
  {
    sku: 'TEST-KIT-DRW-600',
    resize: { minWidthMm: 400, maxWidthMm: 900 },
    role: 'base',
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
    resize: { minWidthMm: 300, maxWidthMm: 1000, minHeightMm: 500, maxHeightMm: 920 },
    role: 'wall',
    name: 'Кухня: верхний шкаф 600',
    category: 'Кухня / Верхние модули',
    basePriceCents: 690000,
    mountHeightMm: WALL_MOUNT_HEIGHT,
    snapToWall: true,
    build: () => wallCabinet(600, 720),
    doors: () => wallCabinetDoor(600, 720),
  },
  {
    sku: 'TEST-KIT-WALL-800',
    resize: { minWidthMm: 400, maxWidthMm: 1200, minHeightMm: 500, maxHeightMm: 920 },
    role: 'wall',
    name: 'Кухня: верхний шкаф 800',
    category: 'Кухня / Верхние модули',
    basePriceCents: 790000,
    mountHeightMm: WALL_MOUNT_HEIGHT,
    snapToWall: true,
    build: () => wallCabinet(800, 720),
    doors: () => wallCabinetDoor(800, 720),
  },
  {
    sku: 'TEST-KIT-TALL-600',
    resize: { minWidthMm: 400, maxWidthMm: 900, minHeightMm: 1800, maxHeightMm: 2400 },
    role: 'tall',
    name: 'Кухня: пенал 600',
    category: 'Кухня / Нижние модули',
    basePriceCents: 1890000,
    mountHeightMm: 0,
    snapToWall: true,
    build: () => tallCabinet(600),
    doors: () => tallCabinetDoors(600),
  },
  {
    sku: 'TEST-KIT-TOP-1200',
    resize: { minWidthMm: 400, maxWidthMm: 3000 },
    role: 'worktop',
    // Пристенный плинтус входит в габарит, но класть на него ничего
    // нельзя: рабочая поверхность — сама плита
    surfaceHeightMm: WORKTOP_THICKNESS,
    name: 'Кухня: столешница 1200',
    category: 'Кухня / Столешницы',
    basePriceCents: 540000,
    mountHeightMm: WORKTOP_HEIGHT,
    snapToWall: true,
    build: () => worktop(1200),
    parts: () => worktopSlab(1200),
  },
  {
    sku: 'TEST-KIT-TOP-2000',
    resize: { minWidthMm: 600, maxWidthMm: 4000 },
    role: 'worktop',
    surfaceHeightMm: WORKTOP_THICKNESS,
    name: 'Кухня: столешница 2000',
    category: 'Кухня / Столешницы',
    basePriceCents: 820000,
    mountHeightMm: WORKTOP_HEIGHT,
    snapToWall: true,
    build: () => worktop(2000),
    parts: () => worktopSlab(2000),
  },
  /**
   * Мойки врезные: бортик ложится заподлицо со столешницей, а чаша
   * уходит вниз, в тумбу. Насколько именно — говорит recessMm.
   * Чаша и смеситель красятся раздельно: это два разных заказа.
   */
  {
    sku: 'TEST-KIT-SINK-SQ-500',
    role: 'sink',
    name: 'Мойка врезная 500, одна чаша',
    category: 'Кухня / Мойки',
    basePriceCents: 1450000,
    mountHeightMm: 0,
    snapToWall: false,
    stackable: true,
    recessMm: SINK_RECESS.square,
    cutout: SINK_CUTOUT.square,
    build: squareSink,
  },
  {
    sku: 'TEST-KIT-SINK-RND-460',
    role: 'sink',
    name: 'Мойка врезная круглая 460',
    category: 'Кухня / Мойки',
    basePriceCents: 1290000,
    mountHeightMm: 0,
    snapToWall: false,
    stackable: true,
    recessMm: SINK_RECESS.round,
    cutout: SINK_CUTOUT.round,
    build: roundSink,
  },
  {
    sku: 'TEST-KIT-SINK-DBL-790',
    role: 'sink',
    name: 'Мойка врезная 790, две чаши',
    category: 'Кухня / Мойки',
    basePriceCents: 2190000,
    mountHeightMm: 0,
    snapToWall: false,
    stackable: true,
    recessMm: SINK_RECESS.double,
    cutout: SINK_CUTOUT.double,
    build: doubleSink,
  },
  {
    sku: 'TEST-KIT-SINK-WING-830',
    role: 'sink',
    name: 'Мойка врезная 830 с крылом',
    category: 'Кухня / Мойки',
    basePriceCents: 1890000,
    mountHeightMm: 0,
    snapToWall: false,
    stackable: true,
    recessMm: SINK_RECESS.drainer,
    cutout: SINK_CUTOUT.drainer,
    build: drainerSink,
  },
  {
    sku: 'TEST-KIT-HOB-580',
    role: 'hob',
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
    role: 'part',
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
    role: 'part',
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
    role: 'part',
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
    role: 'part',
    name: 'Кухня: ручка-скоба 224',
    category: 'Кухня / Детали',
    basePriceCents: 45000,
    mountHeightMm: 0,
    snapToWall: false,
    stackable: true,
    build: () => handle(224),
  },
];
