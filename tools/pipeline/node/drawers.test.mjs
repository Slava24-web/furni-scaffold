import { describe, expect, it } from 'vitest';
import { mergeGeometries } from './geometry.mjs';
import { PRODUCTS, buildProductDrawers, buildProductGeometry } from './catalog.mjs';

const withDrawers = PRODUCTS.filter((product) => buildProductDrawers(product).length > 0);

const MM = 1000;

/** Габарит набора групп по всем осям, миллиметры. */
function extent(groups) {
  const geometry = mergeGeometries(groups.map((group) => group.geometry));
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < geometry.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], geometry.positions[i + axis]);
      max[axis] = Math.max(max[axis], geometry.positions[i + axis]);
    }
  }

  return {
    minY: min[1] * MM,
    maxY: max[1] * MM,
    minZ: min[2] * MM,
    maxZ: max[2] * MM,
    depthMm: (max[2] - min[2]) * MM,
  };
}

/** Габарит изделия с закрытыми ящиками. */
function closedExtent(product) {
  return extent([
    ...buildProductGeometry(product),
    ...buildProductDrawers(product).flatMap((drawer) => drawer.groups),
  ]);
}

describe('выдвижные ящики', () => {
  it('есть и у комода, и у кухонного модуля', () => {
    expect(withDrawers.map((product) => product.sku)).toEqual(
      expect.arrayContaining(['TEST-SBD-1200', 'TEST-KIT-DRW-600']),
    );
  });

  for (const product of withDrawers) {
    const drawers = buildProductDrawers(product);

    it(`${product.sku}: каждый ящик — отдельный узел с уникальным именем`, () => {
      const names = drawers.map((drawer) => drawer.name);
      expect(new Set(names).size).toBe(names.length);
      expect(names.every((name) => name.startsWith('drawer:'))).toBe(true);
    });

    it(`${product.sku}: у ящика есть и фронт, и короб`, () => {
      // Без короба выдвинутый ящик выглядит оторвавшимся фасадом
      for (const drawer of drawers) {
        const materials = drawer.groups.map((group) => group.material);
        expect(materials).toContain('oak');
        expect(materials).toContain('white');
      }
    });

    it(`${product.sku}: ход ящика положительный и не длиннее изделия`, () => {
      const depth = closedExtent(product).depthMm;
      for (const drawer of drawers) {
        expect(drawer.travelMm).toBeGreaterThan(0);
        expect(drawer.travelMm).toBeLessThanOrEqual(depth);
      }
    });

    it(`${product.sku}: закрытый ящик не торчит за корпус`, () => {
      const corpus = closedExtent(product);
      for (const drawer of drawers) {
        const bounds = extent(drawer.groups);
        expect(bounds.maxZ).toBeLessThanOrEqual(corpus.maxZ + 1);
        expect(bounds.minY).toBeGreaterThanOrEqual(corpus.minY - 1);
      }
    });

    it(`${product.sku}: ящики не налезают друг на друга по высоте`, () => {
      const spans = drawers.map((drawer) => extent(drawer.groups)).sort((a, b) => a.minY - b.minY);

      for (let i = 1; i < spans.length; i++) {
        expect(spans[i].minY).toBeGreaterThanOrEqual(spans[i - 1].maxY - 1);
      }
    });
  }
});
