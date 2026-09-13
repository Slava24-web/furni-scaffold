import { describe, expect, it } from 'vitest';
import { KITCHEN_TEMPLATES, buildKitchenTemplate, kitchenTemplate } from './kitchenTemplates';
import { createRectangularRoom } from './walls';
import { checkErgonomics } from '../rules/ergonomics';
import type { CatalogProduct } from '../catalog/schema';

const product = (
  sku: string,
  role: CatalogProduct['role'],
  widthMm: number,
  heightMm: number,
  depthMm: number,
  extra: Partial<CatalogProduct> = {},
): CatalogProduct =>
  ({
    sku,
    name: sku,
    role,
    widthMm,
    heightMm,
    depthMm,
    mountHeightMm: 0,
    resize: {},
    ...extra,
  }) as CatalogProduct;

const catalog: CatalogProduct[] = [
  product('BASE-800', 'base', 800, 820, 618),
  product('BASE-600', 'base', 600, 820, 618),
  product('WALL-800', 'wall', 800, 720, 378, { mountHeightMm: 1450 }),
  product('TOP-2000', 'worktop', 2000, 98, 600, { mountHeightMm: 820, surfaceHeightMm: 38 }),
  product('SINK', 'sink', 552, 472, 498),
  product('HOB', 'hob', 580, 17, 510),
  product('FRIDGE', 'fridge', 600, 2000, 650),
  product('DISH', 'dishwasher', 600, 820, 570),
  product('OVEN', 'oven', 596, 595, 550),
  product('HOOD-DOME-600', 'hood', 600, 900, 500, { mountHeightMm: 1550 }),
  product('HOOD-SLANT-600', 'hood', 600, 800, 505, { mountHeightMm: 1500 }),
  product('HOOD-BUILTIN-600', 'hood', 600, 380, 444, { mountHeightMm: 1450 }),
];

const bySku = new Map(catalog.map((item) => [item.sku, item]));
const room = (widthMm = 4200, depthMm = 3400) => createRectangularRoom({ widthMm, depthMm });

const rolesOf = (skus: readonly string[]): Set<CatalogProduct['role']> =>
  new Set(skus.map((sku) => bySku.get(sku)!.role));

describe('шаблоны кухонь', () => {
  it('шаблонов пять и у каждого свой идентификатор', () => {
    expect(KITCHEN_TEMPLATES).toHaveLength(5);
    expect(new Set(KITCHEN_TEMPLATES.map((t) => t.id)).size).toBe(5);
  });

  it('каждый шаблон собирается в непустую кухню', () => {
    for (const template of KITCHEN_TEMPLATES) {
      const { placements } = buildKitchenTemplate(template, room(), catalog);
      expect(placements.length, template.name).toBeGreaterThan(4);
    }
  });

  it('отделка шаблона проставляется каждому размещению', () => {
    const loft = kitchenTemplate('loft')!;
    const { placements } = buildKitchenTemplate(loft, room(), catalog);

    for (const placement of placements) {
      expect(placement.options.facade).toBe('graphite');
      expect(placement.options.worktop).toBe('graphite');
    }
  });

  it('шаблоны различаются отделкой', () => {
    const facades = KITCHEN_TEMPLATES.map((template) => template.finishes.facade);
    expect(new Set(facades).size).toBeGreaterThan(1);
  });

  it('минимальный шаблон обходится без духовки и посудомойки', () => {
    const compact = kitchenTemplate('compact')!;
    const { placements } = buildKitchenTemplate(compact, room(), catalog);
    const roles = rolesOf(placements.map((placement) => placement.sku));

    expect(roles).toContain('sink');
    expect(roles).toContain('hob');
    expect(roles).not.toContain('oven');
    expect(roles).not.toContain('dishwasher');
  });

  it('полный шаблон ставит духовку и посудомойку', () => {
    const classic = kitchenTemplate('oak-classic')!;
    const { placements } = buildKitchenTemplate(classic, room(), catalog);
    const roles = rolesOf(placements.map((placement) => placement.sku));

    expect(roles).toContain('oven');
    expect(roles).toContain('dishwasher');
  });

  it('шаблон выбирает вытяжку своего типа', () => {
    const hoodIn = (id: string): string | undefined => {
      const { placements } = buildKitchenTemplate(kitchenTemplate(id)!, room(), catalog);
      return placements.map((p) => p.sku).find((sku) => bySku.get(sku)!.role === 'hood');
    };

    expect(hoodIn('loft')).toBe('HOOD-SLANT-600');
    expect(hoodIn('oak-classic')).toBe('HOOD-DOME-600');
    expect(hoodIn('nordic')).toBe('HOOD-BUILTIN-600');
  });

  it('шаблон без подходящей вытяжки берёт любую, а не падает', () => {
    const onlyDome = catalog.filter((item) => item.sku !== 'HOOD-SLANT-600');
    const { placements } = buildKitchenTemplate(kitchenTemplate('loft')!, room(), onlyDome);
    const hood = placements.map((p) => p.sku).find((sku) => bySku.get(sku)!.role === 'hood');

    // Ближайшая по ширине из оставшихся, а не пусто
    expect(hood).toBe('HOOD-DOME-600');
  });

  it('собранные шаблоны проходят проверку эргономики', () => {
    for (const template of KITCHEN_TEMPLATES) {
      const place = room(4200, 3400);
      const { placements } = buildKitchenTemplate(template, place, catalog);
      const codes = checkErgonomics(placements, bySku, [place]).map((finding) => finding.code);

      expect(codes, template.name).not.toContain('sink-in-corner');
      expect(codes, template.name).not.toContain('hob-in-corner');
      expect(codes, template.name).not.toContain('dishwasher-standing');
      // Рабочая поверхность между мойкой и плитой обязана быть даже там,
      // где посудомойки в шаблоне нет
      expect(codes, template.name).not.toContain('sink-hob-close');
      expect(codes, template.name).not.toContain('sink-landing');
    }
  });
});
