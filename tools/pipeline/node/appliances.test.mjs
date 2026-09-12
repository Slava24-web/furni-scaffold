import { describe, expect, it } from 'vitest';
import { boundsMm, mergeGeometries } from './geometry.mjs';
import { APPLIANCE_PRODUCTS } from './appliances.mjs';
import { WORKTOP_HEIGHT, WORKTOP_THICKNESS } from './kitchen.mjs';

/** Рабочая поверхность кухни: под неё встаёт напольная техника. */
const WORKING_HEIGHT = WORKTOP_HEIGHT + WORKTOP_THICKNESS;

const bySku = new Map(APPLIANCE_PRODUCTS.map((product) => [product.sku, product]));

/** Габарит изделия целиком. */
function extent(product) {
  return boundsMm(mergeGeometries(Object.values(product.build()).flat()));
}

/** Габарит деталей одного материала. */
function part(product, material) {
  return boundsMm(mergeGeometries(product.build()[material]));
}

describe('бытовая техника', () => {
  it('в каталоге есть и техника, и вытяжки', () => {
    const hoods = APPLIANCE_PRODUCTS.filter((p) => p.category.includes('Вытяжки'));
    expect(hoods.length).toBeGreaterThanOrEqual(3);
    expect(APPLIANCE_PRODUCTS.length - hoods.length).toBeGreaterThanOrEqual(6);
  });

  it('артикулы уникальны', () => {
    const skus = APPLIANCE_PRODUCTS.map((p) => p.sku);
    expect(new Set(skus).size).toBe(skus.length);
  });

  for (const product of APPLIANCE_PRODUCTS) {
    it(`${product.sku}: origin на низе габарита`, () => {
      // Модель, «висящая» над полом, ломает расстановку и снаппинг
      expect(Math.abs(extent(product).minYMm)).toBeLessThanOrEqual(2);
    });

    it(`${product.sku}: габариты положительные`, () => {
      const bounds = extent(product);
      expect(bounds.widthMm).toBeGreaterThan(0);
      expect(bounds.heightMm).toBeGreaterThan(0);
      expect(bounds.depthMm).toBeGreaterThan(0);
    });
  }

  it('встраиваемая техника укладывается в стандартный фронт 600', () => {
    for (const sku of ['TEST-APP-WASHER-600', 'TEST-APP-DISH-600', 'TEST-APP-OVEN-600']) {
      expect(extent(bySku.get(sku)).widthMm).toBeLessThanOrEqual(600);
    }
  });

  it('стиральная машина не выше столешницы: она встаёт под неё', () => {
    expect(extent(bySku.get('TEST-APP-WASHER-600')).heightMm).toBeLessThanOrEqual(WORKING_HEIGHT);
    expect(extent(bySku.get('TEST-APP-DISH-600')).heightMm).toBeLessThanOrEqual(WORKING_HEIGHT);
  });

  it('Side-by-Side разрезан по вертикали, а не по горизонтали', () => {
    // Именно этим он отличается от обычного двухкамерного: дверцы стоят
    // рядом и обе идут во всю высоту
    const doors = part(bySku.get('TEST-APP-FRIDGE-900'), 'steel');
    const body = extent(bySku.get('TEST-APP-FRIDGE-900'));
    expect(doors.heightMm).toBeGreaterThan(body.heightMm * 0.85);
  });

  it('обычный холодильник разрезан по горизонтали', () => {
    const product = bySku.get('TEST-APP-FRIDGE-600');
    const parts = product.build().steel;
    const heights = parts.map((piece) => boundsMm(piece).heightMm).sort((a, b) => b - a);
    // Самая высокая деталь фронта заметно ниже корпуса: над ней морозильник
    expect(heights[0]).toBeLessThan(extent(product).heightMm * 0.75);
  });

  it('вытяжки висят выше рабочей поверхности', () => {
    for (const product of APPLIANCE_PRODUCTS.filter((p) => p.category.includes('Вытяжки'))) {
      expect(product.mountHeightMm).toBeGreaterThan(WORKING_HEIGHT);
    }
  });

  it('вытяжка не задевает потолок стандартной комнаты', () => {
    for (const product of APPLIANCE_PRODUCTS.filter((p) => p.category.includes('Вытяжки'))) {
      expect(product.mountHeightMm + extent(product).heightMm).toBeLessThanOrEqual(2700);
    }
  });

  it('варочная панель и микроволновка ставятся на столешницу', () => {
    for (const sku of ['TEST-APP-HOB-GAS-580', 'TEST-APP-MICRO-500']) {
      expect(bySku.get(sku).stackable).toBe(true);
      expect(bySku.get(sku).snapToWall).toBe(false);
    }
  });

  it('у газовой панели есть решётки над горелками', () => {
    const product = bySku.get('TEST-APP-HOB-GAS-580');
    const grates = part(product, 'graphite');
    const top = extent(product);
    // Решётка лежит выше горелок и образует крест: её габарит квадратный
    expect(grates.heightMm).toBeLessThan(top.heightMm);
    expect(Math.abs(grates.widthMm - grates.depthMm)).toBeLessThan(60);
  });

  it('у техники нет слотов отделки: холодильник не перекрашивают', () => {
    // Слоты выдаются по материалам модели; ни дуба, ни рогожки, ни камня
    for (const product of APPLIANCE_PRODUCTS) {
      const materials = Object.keys(product.build());
      expect(materials).not.toContain('oak');
      expect(materials).not.toContain('fabric');
      expect(materials).not.toContain('stone');
    }
  });
});
