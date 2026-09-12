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
  /** Шаблон с плейсхолдером {lod} */
  urlTemplate: z.string().min(1),
  /** Превью для панели каталога. Пусто — карточка рисуется без картинки */
  thumbnailUrl: z.string().min(1).optional(),
  lods: z.array(CatalogLodSchema).min(1),
  /** Слоты отделки. Пусто — изделие поставляется в одном исполнении */
  finishes: z.array(FinishSlotSchema).default([]),
});

export const CatalogSchema = z.object({
  tenant: z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
  }),
  materials: z.array(CatalogMaterialSchema),
  products: z.array(CatalogProductSchema).min(1),
});

export type Catalog = z.infer<typeof CatalogSchema>;
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;
export type CatalogMaterial = z.infer<typeof CatalogMaterialSchema>;
export type FinishSlot = z.infer<typeof FinishSlotSchema>;

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
