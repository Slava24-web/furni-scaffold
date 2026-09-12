import { describe, expect, it } from 'vitest';
import {
  boundsMm,
  cylinder,
  mergeGeometries,
  rotateX,
  roundedBox,
  segmentedBox,
  translate,
  triangleCount,
} from './geometry.mjs';

const maxIndex = (geometry) => Math.max(...geometry.indices);

describe('segmentedBox', () => {
  it('даёт 12 треугольников на минимальном разбиении', () => {
    expect(triangleCount(segmentedBox(600, 400, 300, 1))).toBe(12);
  });

  it('число треугольников растёт как квадрат сегментов', () => {
    // 6 граней * segments^2 квадов * 2 треугольника
    expect(triangleCount(segmentedBox(600, 400, 300, 4))).toBe(6 * 16 * 2);
    expect(triangleCount(segmentedBox(600, 400, 300, 8))).toBe(6 * 64 * 2);
  });

  it('габарит совпадает с заданным в мм', () => {
    const bounds = boundsMm(segmentedBox(1800, 850, 900, 3));
    expect(bounds).toMatchObject({ widthMm: 1800, heightMm: 850, depthMm: 900 });
  });

  it('все индексы указывают на существующие вершины', () => {
    const box = segmentedBox(600, 400, 300, 3);
    expect(maxIndex(box)).toBeLessThan(box.positions.length / 3);
  });

  it('на каждую вершину приходится нормаль и UV', () => {
    const box = segmentedBox(600, 400, 300, 2);
    const vertices = box.positions.length / 3;
    expect(box.normals.length / 3).toBe(vertices);
    expect(box.uvs.length / 2).toBe(vertices);
  });
});

describe('roundedBox', () => {
  it('не выходит за габарит: скругление режет углы внутрь', () => {
    const bounds = boundsMm(roundedBox(1800, 850, 900, 60, 6));
    expect(bounds.widthMm).toBeLessThanOrEqual(1800);
    expect(bounds.heightMm).toBeLessThanOrEqual(850);
    expect(bounds.depthMm).toBeLessThanOrEqual(900);
  });

  it('в середине грани сохраняет полный размер', () => {
    // Центр грани лежит внутри плоской части, скругление его не двигает
    const rounded = roundedBox(1000, 1000, 1000, 100, 4);
    const xs = [];
    for (let i = 0; i < rounded.positions.length; i += 3) xs.push(rounded.positions[i]);
    expect(Math.max(...xs)).toBeCloseTo(0.5, 5);
  });

  it('нулевой радиус вырождается в обычный бокс', () => {
    const sharp = roundedBox(600, 400, 300, 0, 2);
    expect(boundsMm(sharp)).toMatchObject({ widthMm: 600, heightMm: 400, depthMm: 300 });
  });

  it('радиус ограничен половиной наименьшей стороны', () => {
    // Запрос радиуса больше половины габарита не должен выворачивать геометрию
    const bounds = boundsMm(roundedBox(400, 400, 400, 5000, 4));
    expect(bounds.widthMm).toBeLessThanOrEqual(400);
    expect(bounds.widthMm).toBeGreaterThan(0);
  });

  it('нормали единичной длины — иначе освещение поедет', () => {
    const rounded = roundedBox(800, 400, 400, 50, 4);
    for (let i = 0; i < rounded.normals.length; i += 3) {
      const length = Math.hypot(rounded.normals[i], rounded.normals[i + 1], rounded.normals[i + 2]);
      expect(length).toBeCloseTo(1, 5);
    }
  });
});

describe('cylinder', () => {
  it('габарит равен диаметру и высоте', () => {
    const bounds = boundsMm(cylinder(30, 700, 24));
    expect(bounds.heightMm).toBe(700);
    expect(bounds.widthMm).toBeCloseTo(60, 0);
  });

  it('боковая поверхность и две крышки дают ожидаемое число треугольников', () => {
    const segments = 12;
    // 2 на сегмент боковины + по одному на сегмент каждой крышки
    expect(triangleCount(cylinder(30, 700, segments))).toBe(segments * 2 + segments * 2);
  });

  it('индексы не выходят за границы буфера', () => {
    const geometry = cylinder(30, 700, 16);
    expect(maxIndex(geometry)).toBeLessThan(geometry.positions.length / 3);
  });
});

describe('mergeGeometries', () => {
  it('суммирует треугольники и переиндексирует вершины', () => {
    const a = segmentedBox(100, 100, 100, 1);
    const b = translate(segmentedBox(100, 100, 100, 1), 500, 0, 0);
    const merged = mergeGeometries([a, b]);

    expect(triangleCount(merged)).toBe(triangleCount(a) + triangleCount(b));
    expect(maxIndex(merged)).toBeLessThan(merged.positions.length / 3);
    expect(boundsMm(merged).widthMm).toBe(600);
  });

  it('пустой список даёт пустую геометрию', () => {
    expect(triangleCount(mergeGeometries([]))).toBe(0);
  });
});

describe('translate', () => {
  it('сдвигает габарит, не меняя размеров', () => {
    const box = translate(segmentedBox(200, 300, 400, 1), 0, 1000, 0);
    const bounds = boundsMm(box);
    expect(bounds).toMatchObject({ widthMm: 200, heightMm: 300, depthMm: 400 });
    expect(bounds.minYMm).toBe(850);
  });
});

describe('поворот вокруг оси X', () => {
  it('переводит верх детали в её перед', () => {
    const geometry = rotateX(segmentedBox(100, 400, 100, 1), Math.PI / 2);
    const bounds = boundsMm(geometry);

    expect(bounds.heightMm).toBeCloseTo(100, 3);
    expect(bounds.depthMm).toBeCloseTo(400, 3);
  });

  it('поворачивает нормали вместе с позициями', () => {
    // Иначе наклонная деталь бликует как горизонтальная
    const geometry = rotateX(segmentedBox(100, 100, 100, 1), Math.PI / 2);
    for (let i = 0; i < geometry.normals.length; i += 3) {
      const length = Math.hypot(
        geometry.normals[i],
        geometry.normals[i + 1],
        geometry.normals[i + 2],
      );
      expect(length).toBeCloseTo(1, 5);
    }
  });

  it('нулевой угол ничего не меняет', () => {
    const before = segmentedBox(200, 300, 400, 1);
    const after = rotateX(segmentedBox(200, 300, 400, 1), 0);
    expect(after.positions).toEqual(before.positions);
  });
});
