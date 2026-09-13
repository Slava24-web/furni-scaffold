import { placementBox, type Box } from '../scene/box';
import { placementProductSize } from '../scene/resize';
import type { CatalogProduct } from '../catalog/schema';
import type { Placement } from '../scene/schema';
import type { Vec2 } from '../scene/walls';

/**
 * Размещение, подготовленное к проверке правил.
 *
 * Правила смотрят на габарит и роль, а не на документ: пересчитывать
 * габарит в каждом правиле значило бы делать это по десятку раз на
 * каждое изменение сцены.
 */
export interface KitchenItem {
  instanceId: string;
  role: CatalogProduct['role'];
  product: CatalogProduct;
  placement: Placement;
  box: Box;
  centre: Vec2;
}

export function kitchenItems(
  placements: readonly Placement[],
  products: ReadonlyMap<string, CatalogProduct>,
): KitchenItem[] {
  const items: KitchenItem[] = [];

  for (const placement of placements) {
    const product = products.get(placement.sku);
    if (!product) continue;
    const box = placementBox(placement, placementProductSize(placement, product));
    items.push({
      instanceId: placement.instanceId,
      role: product.role,
      product,
      placement,
      box,
      centre: box.centre,
    });
  }

  return items;
}

/** Роли, у которых есть фронт: между ними и ходят, ими и режут столешницу. */
export const FRONTED: ReadonlySet<CatalogProduct['role']> = new Set([
  'base',
  'tall',
  'fridge',
  'oven',
  'dishwasher',
  'washer',
]);

/** Роли во всю высоту: они разрывают рабочую поверхность. */
export const FULL_HEIGHT: ReadonlySet<CatalogProduct['role']> = new Set([
  'tall',
  'fridge',
]);

export const pickRole = (items: readonly KitchenItem[], role: CatalogProduct['role']): KitchenItem[] =>
  items.filter((item) => item.role === role);

export const distanceMm = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
