import type { CatalogProduct } from '../catalog/schema';
import type { Placement } from './schema';

/**
 * Заказанные габариты изделия.
 *
 * Мебель на заказ пилят под место: тот же корпус бывает 600 и 615,
 * потому что между стеной и трубой ровно столько. Планировщик, который
 * этого не умеет, показывает не ту кухню, которую привезут.
 *
 * Тянется не всё и не по всем осям: у холодильника стандартная ширина,
 * и растянутый на 900 он перестанет быть тем товаром, который лежит на
 * складе. Пределы задаёт каталог, ось без пределов не тянется.
 */

export interface SizeMm {
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

export type SizeAxis = 'widthMm' | 'heightMm' | 'depthMm';

export interface AxisLimits {
  minMm: number;
  maxMm: number;
}

/** Пределы по оси. null — ось не тянется. */
export function axisLimits(product: CatalogProduct, axis: SizeAxis): AxisLimits | null {
  const limits = product.resize;
  const min =
    axis === 'widthMm' ? limits.minWidthMm : axis === 'heightMm' ? limits.minHeightMm : limits.minDepthMm;
  const max =
    axis === 'widthMm' ? limits.maxWidthMm : axis === 'heightMm' ? limits.maxHeightMm : limits.maxDepthMm;

  if (min === undefined && max === undefined) return null;
  return { minMm: min ?? product[axis], maxMm: max ?? product[axis] };
}

export function isResizable(product: CatalogProduct): boolean {
  return (['widthMm', 'heightMm', 'depthMm'] as const).some(
    (axis) => axisLimits(product, axis) !== null,
  );
}

/**
 * Габариты размещения с учётом заказанного размера.
 *
 * Значение вне пределов прижимается к ним, а не отбрасывается: документ
 * мог прийти из старой версии или из чужих рук, и молча вернуть
 * каталожный размер значит показать не то, что заказано.
 */
export function placementSize(
  placement: Partial<Pick<Placement, 'size'>>,
  product: CatalogProduct,
): SizeMm {
  const value = (axis: SizeAxis): number => {
    // Поле новое: в документах прежних версий и в набросках, собранных
    // в коде без разбора схемой, его может не быть вовсе
    const ordered = placement.size?.[axis];
    if (ordered === undefined) return product[axis];

    const limits = axisLimits(product, axis);
    if (!limits) return product[axis];
    return Math.min(limits.maxMm, Math.max(limits.minMm, Math.round(ordered)));
  };

  return { widthMm: value('widthMm'), heightMm: value('heightMm'), depthMm: value('depthMm') };
}

/**
 * Во сколько раз изделие растянуто по каждой оси.
 *
 * Нужен и вьюеру для масштаба модели, и раскрою для размеров деталей:
 * растянутый корпус пилят из больших панелей, а не из каталожных.
 */
export function sizeFactors(
  placement: Partial<Pick<Placement, 'size'>>,
  product: CatalogProduct,
): { width: number; height: number; depth: number } {
  const size = placementSize(placement, product);
  return {
    width: product.widthMm === 0 ? 1 : size.widthMm / product.widthMm,
    height: product.heightMm === 0 ? 1 : size.heightMm / product.heightMm,
    depth: product.depthMm === 0 ? 1 : size.depthMm / product.depthMm,
  };
}

/**
 * Габариты для проверки коллизий: размер плюс рабочая поверхность.
 *
 * Отдельная функция, потому что забыть про поверхность легко, а цена
 * ошибки — мойка, повисшая над столешницей.
 */
export function placementProductSize(
  placement: Partial<Pick<Placement, 'size'>>,
  product: CatalogProduct,
): SizeMm & { surfaceHeightMm: number } {
  return {
    ...placementSize(placement, product),
    surfaceHeightMm: placementSurfaceHeightMm(placement, product),
  };
}

/**
 * Высота рабочей поверхности растянутого изделия.
 *
 * Тянется вместе с высотой: у столешницы, поднятой до 900, плита тоже
 * оказывается выше.
 */
export function placementSurfaceHeightMm(
  placement: Partial<Pick<Placement, 'size'>>,
  product: CatalogProduct,
): number {
  const base = product.surfaceHeightMm ?? product.heightMm;
  return Math.round(base * sizeFactors(placement, product).height);
}
