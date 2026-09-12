import { describe, expect, it } from 'vitest';
import {
  axisLimits,
  isResizable,
  placementProductSize,
  placementSize,
  placementSurfaceHeightMm,
  sizeFactors,
} from './resize';
import type { CatalogProduct } from '../catalog/schema';
import type { Placement } from './schema';

const product = (over: Partial<CatalogProduct> = {}): CatalogProduct =>
  ({
    sku: 'BASE',
    widthMm: 600,
    heightMm: 820,
    depthMm: 560,
    resize: { minWidthMm: 300, maxWidthMm: 1000 },
    ...over,
  }) as CatalogProduct;

const at = (size: Placement['size'] = {}): Pick<Placement, 'size'> => ({ size });

describe('заказанный размер', () => {
  it('без заказа берётся каталожный', () => {
    expect(placementSize(at(), product())).toEqual({
      widthMm: 600,
      heightMm: 820,
      depthMm: 560,
    });
  });

  it('заказанный размер применяется', () => {
    expect(placementSize(at({ widthMm: 900 }), product()).widthMm).toBe(900);
  });

  it('размер вне пределов прижимается, а не отбрасывается', () => {
    // Документ мог прийти из старой версии или из чужих рук
    expect(placementSize(at({ widthMm: 5000 }), product()).widthMm).toBe(1000);
    expect(placementSize(at({ widthMm: 10 }), product()).widthMm).toBe(300);
  });

  it('ось без пределов не тянется', () => {
    // Высоту этого изделия каталог не разрешает менять
    expect(placementSize(at({ heightMm: 2000 }), product()).heightMm).toBe(820);
  });

  it('документ без поля размера не роняет расчёт', () => {
    expect(placementSize({} as Pick<Placement, 'size'>, product()).widthMm).toBe(600);
  });

  it('нецелое значение округляется: миллиметр — минимальная единица', () => {
    expect(placementSize(at({ widthMm: 700.6 }), product()).widthMm).toBe(701);
  });
});

describe('пределы осей', () => {
  it('ось без настроек пределов не имеет', () => {
    expect(axisLimits(product(), 'depthMm')).toBeNull();
  });

  it('незаданная граница берётся из каталожного размера', () => {
    const limits = axisLimits(product({ resize: { maxWidthMm: 1200 } }), 'widthMm')!;
    expect(limits.minMm).toBe(600);
    expect(limits.maxMm).toBe(1200);
  });

  it('изделие без пределов не тянется вовсе', () => {
    expect(isResizable(product({ resize: {} }))).toBe(false);
    expect(isResizable(product())).toBe(true);
  });
});

describe('множители растяжения', () => {
  it('без заказа все единичные', () => {
    expect(sizeFactors(at(), product())).toEqual({ width: 1, height: 1, depth: 1 });
  });

  it('считаются от каталожного размера', () => {
    expect(sizeFactors(at({ widthMm: 900 }), product()).width).toBeCloseTo(1.5, 6);
  });
});

describe('рабочая поверхность растянутого изделия', () => {
  const worktop = product({
    heightMm: 98,
    surfaceHeightMm: 38,
    resize: { minHeightMm: 60, maxHeightMm: 200 },
  });

  it('без растяжения совпадает с каталожной', () => {
    expect(placementSurfaceHeightMm(at(), worktop)).toBe(38);
  });

  it('тянется вместе с высотой', () => {
    // Высота 196 — вдвое больше каталожной
    expect(placementSurfaceHeightMm(at({ heightMm: 196 }), worktop)).toBe(76);
  });

  it('в габаритах для коллизий поверхность отдельно от верха', () => {
    const size = placementProductSize(at(), worktop);
    expect(size.heightMm).toBe(98);
    expect(size.surfaceHeightMm).toBe(38);
  });
});
