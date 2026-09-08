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
  materials: z.array(z.string()).default([]),
  /** Шаблон с плейсхолдером {lod} */
  urlTemplate: z.string().min(1),
  lods: z.array(CatalogLodSchema).min(1),
});

export const CatalogSchema = z.object({
  tenant: z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
  }),
  materials: z.array(
    z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      priceModifierCents: z.number().int().default(0),
    }),
  ),
  products: z.array(CatalogProductSchema).min(1),
});

export type Catalog = z.infer<typeof CatalogSchema>;
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;

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
