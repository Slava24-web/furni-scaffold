import { describe, expect, it } from 'vitest';
import { CatalogSchema, groupByCategory, type CatalogProduct } from './schema';

const product = (over: Partial<CatalogProduct> = {}) => ({
  sku: 'TEST-KIT-BASE-600',
  name: 'Нижний шкаф 600',
  category: 'Кухня / Нижние модули',
  type: 'static' as const,
  basePriceCents: 890000,
  widthMm: 600,
  heightMm: 820,
  depthMm: 618,
  materials: ['white', 'oak'],
  urlTemplate: '/assets/test/TEST-KIT-BASE-600/lod{lod}.glb',
  lods: [{ lod: 0, bytes: 1000, triangles: 444 }],
  ...over,
});

const catalog = (products: unknown[]) => ({
  tenant: { slug: 'test', name: 'Тест' },
  materials: [{ code: 'oak', name: 'Дуб', priceModifierCents: 0 }],
  products,
});

describe('схема каталога', () => {
  it('принимает корректный манифест', () => {
    const parsed = CatalogSchema.parse(catalog([product()]));
    expect(parsed.products[0]?.sku).toBe('TEST-KIT-BASE-600');
  });

  it('подставляет значения по умолчанию для высоты установки и привязки', () => {
    const parsed = CatalogSchema.parse(catalog([product()]));
    expect(parsed.products[0]?.mountHeightMm).toBe(0);
    expect(parsed.products[0]?.snapToWall).toBe(true);
  });

  it('сохраняет высоту установки верхнего шкафа', () => {
    const parsed = CatalogSchema.parse(catalog([product({ mountHeightMm: 1450 })]));
    expect(parsed.products[0]?.mountHeightMm).toBe(1450);
  });

  it('отвергает манифест без товаров', () => {
    expect(() => CatalogSchema.parse(catalog([]))).toThrow();
  });

  it('отвергает нулевые габариты: объект без размера нельзя разместить', () => {
    expect(() => CatalogSchema.parse(catalog([product({ widthMm: 0 })]))).toThrow();
  });

  it('отвергает товар без уровней детализации', () => {
    expect(() => CatalogSchema.parse(catalog([product({ lods: [] })]))).toThrow();
  });

  it('отвергает отрицательную высоту установки', () => {
    expect(() => CatalogSchema.parse(catalog([product({ mountHeightMm: -100 })]))).toThrow();
  });
});

describe('группировка каталога', () => {
  it('собирает товары по категориям, сохраняя порядок', () => {
    const groups = groupByCategory([
      product({ sku: 'A', category: 'Кухня / Нижние модули' }),
      product({ sku: 'B', category: 'Кухня / Верхние модули' }),
      product({ sku: 'C', category: 'Кухня / Нижние модули' }),
    ] as CatalogProduct[]);

    expect(groups.map((g) => g.category)).toEqual([
      'Кухня / Нижние модули',
      'Кухня / Верхние модули',
    ]);
    expect(groups[0]?.products.map((p) => p.sku)).toEqual(['A', 'C']);
  });

  it('пустой каталог даёт пустой список групп', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});
