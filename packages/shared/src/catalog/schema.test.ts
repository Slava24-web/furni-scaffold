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
  materials: [
    {
      code: 'oak',
      name: 'Дуб',
      priceModifierCents: 0,
      baseColorFactor: [0.9, 0.8, 0.7, 1],
      roughness: 0.6,
      metallic: 0,
      textureUrl: '/assets/test/textures/wood.webp',
    },
  ],
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

  it('по умолчанию ящиков нет: изделие цельное', () => {
    const parsed = CatalogSchema.parse(catalog([product()]));
    expect(parsed.products[0]?.drawerCount).toBe(0);
  });

  it('сохраняет число выдвижных ящиков', () => {
    const parsed = CatalogSchema.parse(catalog([product({ drawerCount: 3 })]));
    expect(parsed.products[0]?.drawerCount).toBe(3);
  });

  it('отвергает дробное число ящиков', () => {
    expect(() => CatalogSchema.parse(catalog([product({ drawerCount: 1.5 })]))).toThrow();
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

describe('слоты отделки в схеме', () => {
  const slot = {
    code: 'facade',
    label: 'Фасад',
    slotMaterial: 'oak',
    options: ['oak', 'white'],
  };

  it('по умолчанию слотов нет: изделие в одном исполнении', () => {
    const parsed = CatalogSchema.parse(catalog([product()]));
    expect(parsed.products[0]?.finishes).toEqual([]);
  });

  it('слот принимается целиком', () => {
    const parsed = CatalogSchema.parse(catalog([product({ finishes: [slot] })]));
    expect(parsed.products[0]?.finishes[0]).toEqual(slot);
  });

  it('слот без вариантов отвергается: выбирать было бы не из чего', () => {
    expect(() =>
      CatalogSchema.parse(catalog([product({ finishes: [{ ...slot, options: [] }] })])),
    ).toThrow();
  });

  it('слот без привязки к материалу модели отвергается', () => {
    expect(() =>
      CatalogSchema.parse(catalog([product({ finishes: [{ ...slot, slotMaterial: '' }] })])),
    ).toThrow();
  });
});

describe('материалы в схеме', () => {
  it('материал без цвета отвергается: собрать его в браузере нечем', () => {
    const broken = {
      tenant: { slug: 'test', name: 'Тест' },
      materials: [{ code: 'oak', name: 'Дуб', priceModifierCents: 0 }],
      products: [product()],
    };
    expect(() => CatalogSchema.parse(broken)).toThrow();
  });

  it('текстура необязательна: одноцветный материал допустим', () => {
    const plain = {
      tenant: { slug: 'test', name: 'Тест' },
      materials: [
        {
          code: 'white',
          name: 'Белый',
          priceModifierCents: 0,
          baseColorFactor: [0.9, 0.9, 0.9, 1],
          roughness: 0.5,
          metallic: 0,
        },
      ],
      products: [product()],
    };
    expect(CatalogSchema.parse(plain).materials[0]?.textureUrl).toBeUndefined();
  });
});
