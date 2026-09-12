import { z } from 'zod';

/**
 * Манифест каталога, который выпускает пайплайн ассетов.
 *
 * Разбирается Zod на границе: файл приходит по сети и формально является
 * внешними данными, даже если сгенерирован нами (CLAUDE.md, конвенции).
 * Молча принять манифест со старой схемой значит получить сцену без
 * моделей и невнятную ошибку в глубине загрузчика.
 */

export const CatalogLodSchema = z.object({
  lod: z.number().int().min(0).max(2),
  bytes: z.number().int().nonnegative(),
  triangles: z.number().int().nonnegative(),
});

/**
 * Материал тенанта: и цена, и всё нужное, чтобы собрать его в браузере.
 *
 * Отделку нельзя держать только внутри GLB: сменить её на текстурную
 * было бы нечем, ведь в модель попадают лишь те карты, что она
 * использует. Поэтому материалы описаны отдельно, а текстуры лежат
 * самостоятельными файлами.
 */
export const CatalogMaterialSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  priceModifierCents: z.number().int().default(0),
  baseColorFactor: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  roughness: z.number().min(0).max(1),
  metallic: z.number().min(0).max(1),
  textureUrl: z.string().min(1).optional(),
});

/**
 * Листовая деталь изделия: из таких собирается карта раскроя.
 *
 * Толщина отделена от габарита: пилят из плиты своей толщины, и
 * шестимиллиметровая задняя стенка не ляжет на тот же лист, что
 * восемнадцатимиллиметровая боковина.
 */
export const PanelSpecSchema = z.object({
  name: z.string().min(1),
  material: z.string().min(1),
  widthMm: z.number().int().positive(),
  heightMm: z.number().int().positive(),
  thicknessMm: z.number().int().positive(),
  /** Направленный рисунок: такую деталь при раскрое не повернуть */
  grain: z.boolean().default(false),
});

/**
 * Слот отделки: какой материал модели можно подменить и на что.
 *
 * `slotMaterial` — имя материала внутри GLB. Пайплайн сохраняет имена
 * на всех уровнях детализации, по ним клиент и находит нужные меши.
 */
export const FinishSlotSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  slotMaterial: z.string().min(1),
  options: z.array(z.string().min(1)).min(1),
});

export const CatalogProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  type: z.enum(['static', 'parametric']),
  basePriceCents: z.number().int().nonnegative(),
  widthMm: z.number().int().positive(),
  heightMm: z.number().int().positive(),
  depthMm: z.number().int().positive(),
  /** Высота установки низа модели над полом: верхние шкафы висят */
  mountHeightMm: z.number().int().min(0).default(0),
  /** Участвует ли объект в привязке к стенам */
  snapToWall: z.boolean().default(true),
  /**
   * Может ли объект стоять на других объектах.
   *
   * Признак явный, а не выводимый из габаритов: без него опорой считался
   * бы любой объект под точкой, и нижний шкаф, протащенный под навесным,
   * взлетал бы на него. Корпусная мебель стоит на полу или висит на своей
   * отметке, а на столешницу ставят мелочь.
   */
  stackable: z.boolean().default(false),
  materials: z.array(z.string()).default([]),
  /**
   * Роль изделия в кухне: по ней считаются правила эргономики.
   *
   * Задаётся каталогом, а не выводится из артикула: у каждого тенанта
   * своя система артикулов, и разбор строки развалился бы на первом же
   * магазине.
   */
  role: z
    .enum([
      'base',
      'wall',
      'tall',
      'worktop',
      'sink',
      'hob',
      'hood',
      'fridge',
      'oven',
      'dishwasher',
      'washer',
      'microwave',
      'furniture',
      'part',
    ])
    .default('furniture'),
  /**
   * Сколько ящиков изделия можно выдвинуть.
   *
   * Нужен интерфейсу, а не сцене: ящики она находит по узлам самой
   * модели. По этому числу панель свойств подсказывает, что фасад
   * вообще открывается — иначе о такой возможности не догадаться.
   */
  drawerCount: z.number().int().min(0).default(0),
  /**
   * Ход направляющей: на столько ящик выезжает вперёд.
   *
   * Нужен проверке коллизий: ящику должно хватить места перед фасадом,
   * иначе тумбу нельзя открыть, а узнаётся это уже на монтаже.
   */
  drawerTravelMm: z.number().int().min(0).default(0),
  /** Листовые детали изделия. Пусто — изделие не пилят из плиты */
  panels: z.array(PanelSpecSchema).default([]),
  /** Шаблон с плейсхолдером {lod} */
  urlTemplate: z.string().min(1),
  /** Превью для панели каталога. Пусто — карточка рисуется без картинки */
  thumbnailUrl: z.string().min(1).optional(),
  lods: z.array(CatalogLodSchema).min(1),
  /** Слоты отделки. Пусто — изделие поставляется в одном исполнении */
  finishes: z.array(FinishSlotSchema).default([]),
});

/**
 * Напольное покрытие тенанта.
 *
 * Пол занимает больше площади, чем вся мебель вместе взятая, поэтому
 * исполнение выбирается отдельно от отделки изделий. `repeatMm` — размер
 * квадрата текстуры в миллиметрах: без него доска растягивается на всю
 * комнату и превращается в узор непонятного масштаба.
 */
export const FloorFinishSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  /** Тип покрытия: ламинат, паркет, инженерная доска, плитка */
  kind: z.string().min(1),
  repeatMm: z.number().int().positive(),
  roughness: z.number().min(0).max(1).default(0.6),
  textureUrl: z.string().min(1),
});

export const CatalogSchema = z.object({
  tenant: z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
  }),
  materials: z.array(CatalogMaterialSchema),
  /** Покрытия пола. Пусто — пол остаётся служебного цвета */
  floors: z.array(FloorFinishSchema).default([]),
  products: z.array(CatalogProductSchema).min(1),
});

export type Catalog = z.infer<typeof CatalogSchema>;
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;
export type CatalogMaterial = z.infer<typeof CatalogMaterialSchema>;
export type FinishSlot = z.infer<typeof FinishSlotSchema>;
export type FloorFinish = z.infer<typeof FloorFinishSchema>;
export type PanelSpec = z.infer<typeof PanelSpecSchema>;

/** Группировка покрытий по типу: в магазине их показывают так же. */
export function groupFloorsByKind(
  floors: readonly FloorFinish[],
): { kind: string; floors: FloorFinish[] }[] {
  const groups = new Map<string, FloorFinish[]>();
  for (const floor of floors) {
    const list = groups.get(floor.kind);
    if (list) list.push(floor);
    else groups.set(floor.kind, [floor]);
  }
  return [...groups].map(([kind, items]) => ({ kind, floors: items }));
}

/** Группировка для панели каталога. Порядок категорий — как в манифесте. */
export function groupByCategory(
  products: readonly CatalogProduct[],
): { category: string; products: CatalogProduct[] }[] {
  const groups = new Map<string, CatalogProduct[]>();
  for (const product of products) {
    const list = groups.get(product.category);
    if (list) list.push(product);
    else groups.set(product.category, [product]);
  }
  return [...groups].map(([category, items]) => ({ category, products: items }));
}
