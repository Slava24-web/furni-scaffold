import { describe, expect, it } from 'vitest';
import { cylinder, mergeGeometries, roundedBox, segmentedBox, taperedCylinder } from './geometry.mjs';
import { carcassPanels, openBoxPanels } from './carcass.mjs';
import { PRODUCTS, buildProductDrawers, buildProductGeometry } from './catalog.mjs';
import { taperedLegs } from './legs.mjs';

/**
 * Обход вершин наружу.
 *
 * Three.js считает лицевыми треугольники с обходом против часовой стрелки
 * при взгляде снаружи и отсекает остальные. Грань с обратным обходом
 * просто исчезает, и сквозь мебель видно фон — именно так у дивана
 * просвечивали стыки между подушками.
 *
 * Проверяем согласованность: геометрическая нормаль треугольника обязана
 * смотреть туда же, куда нормали его вершин.
 */
function invertedTriangles(geometry) {
  const at = (buffer, index, size) =>
    Array.from({ length: size }, (_, axis) => buffer[index * size + axis]);

  let inverted = 0;
  for (let i = 0; i < geometry.indices.length; i += 3) {
    const [ia, ib, ic] = [geometry.indices[i], geometry.indices[i + 1], geometry.indices[i + 2]];
    const [a, b, c] = [ia, ib, ic].map((index) => at(geometry.positions, index, 3));

    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [
      u[1] * w[2] - u[2] * w[1],
      u[2] * w[0] - u[0] * w[2],
      u[0] * w[1] - u[1] * w[0],
    ];
    // Вырожденный треугольник ориентации не имеет
    if (Math.hypot(...cross) < 1e-12) continue;

    const normal = at(geometry.normals, ia, 3);
    if (cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] <= 0) inverted++;
  }
  return inverted;
}

/** Нормаль нулевой длины гасит освещение детали. */
function zeroNormals(geometry) {
  let zeros = 0;
  for (let i = 0; i < geometry.normals.length; i += 3) {
    const length = Math.hypot(geometry.normals[i], geometry.normals[i + 1], geometry.normals[i + 2]);
    if (length < 1e-6) zeros++;
  }
  return zeros;
}

describe('обход вершин у построителей', () => {
  const cases = {
    'бокс без разбиения': segmentedBox(1000, 1000, 1000, 1),
    'бокс с разбиением': segmentedBox(800, 600, 400, 4),
    'скруглённый бокс': roundedBox(1800, 850, 900, 60, 10),
    'скруглённый бокс с малым радиусом': roundedBox(600, 400, 300, 3, 3),
    'скруглённый бокс с нулевым радиусом': roundedBox(600, 400, 300, 0, 2),
    'скруглённый бокс с предельным радиусом': roundedBox(400, 400, 400, 5000, 4),
    цилиндр: cylinder(30, 700, 16),
    'усечённый конус': taperedCylinder(26, 16, 90, 10),
    'конус с равными радиусами': taperedCylinder(20, 20, 100, 8),
    ножки: mergeGeometries(taperedLegs(1200, 450, { heightMm: 80 })),
    'корпус из панелей': mergeGeometries(carcassPanels(600, 720, 560, { shelves: 2 })),
    'открытый короб': mergeGeometries(openBoxPanels(600, 176, 500)),
  };

  for (const [name, geometry] of Object.entries(cases)) {
    it(`${name}: все грани смотрят наружу`, () => {
      expect(invertedTriangles(geometry)).toBe(0);
    });

    it(`${name}: нормали ненулевые`, () => {
      expect(zeroNormals(geometry)).toBe(0);
    });
  }
});

describe('обход вершин у изделий каталога', () => {
  for (const product of PRODUCTS) {
    it(`${product.sku}: ни одной вывернутой грани`, () => {
      // Ящики — часть изделия: вывернутая грань короба видна, как
      // только ящик выдвинут
      const groups = [
        ...buildProductGeometry(product),
        ...buildProductDrawers(product).flatMap((drawer) => drawer.groups),
      ];
      const merged = mergeGeometries(groups.map((g) => g.geometry));
      expect(invertedTriangles(merged)).toBe(0);
      expect(zeroNormals(merged)).toBe(0);
    });
  }
});
