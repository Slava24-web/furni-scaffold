import { describe, expect, it } from 'vitest';
import { boxesOverlap, resolveOverlaps, separationVector, type Box } from './collision';

const box = (x: number, z: number, over: Partial<Box> = {}): Box => ({
  centre: { x, y: z },
  halfWidthMm: 300,
  halfDepthMm: 300,
  rotationDeg: 0,
  bottomMm: 0,
  topMm: 800,
  ...over,
});

describe('вектор выталкивания', () => {
  it('у непересекающихся габаритов его нет', () => {
    expect(separationVector(box(0, 0), box(2000, 0))).toBeNull();
  });

  it('у стоящих вплотную его нет: это законная стыковка', () => {
    expect(separationVector(box(0, 0), box(600, 0))).toBeNull();
  });

  it('объект НА другом не выталкивается: так и ставят', () => {
    const below = box(0, 0, { bottomMm: 0, topMm: 800 });
    const above = box(0, 0, { bottomMm: 800, topMm: 1100 });
    expect(separationVector(above, below)).toBeNull();
  });

  it('выталкивает по кратчайшему пути', () => {
    // Наложение на 100 мм по X и на 500 по Z: выходить надо по X
    const push = separationVector(box(500, 100), box(0, 0))!;
    expect(Math.abs(push.x)).toBeGreaterThan(Math.abs(push.y));
    expect(push.x).toBeGreaterThan(0);
  });

  it('после сдвига на вектор пересечения больше нет', () => {
    const moving = box(500, 100);
    const push = separationVector(moving, box(0, 0))!;
    const moved = { ...moving, centre: { x: moving.centre.x + push.x, y: moving.centre.y + push.y } };

    expect(boxesOverlap(moved, box(0, 0))).toBe(false);
  });

  it('учитывает поворот габарита', () => {
    const turned = box(0, 0, { rotationDeg: 45, halfWidthMm: 600, halfDepthMm: 200 });
    const push = separationVector(box(500, 0), turned);
    expect(push).not.toBeNull();
  });
});

describe('разрешение пересечений', () => {
  it('свободная позиция не меняется', () => {
    expect(resolveOverlaps(box(3000, 3000), [box(0, 0)])).toEqual({ x: 3000, y: 3000 });
  });

  it('объект выталкивается из соседа', () => {
    const centre = resolveOverlaps(box(400, 0), [box(0, 0)]);
    expect(boxesOverlap({ ...box(400, 0), centre }, box(0, 0))).toBe(false);
  });

  it('выталкивание из одного не оставляет объект в другом', () => {
    // Между соседями есть просвет 800 мм: объект шириной 600 в него влезает
    const obstacles = [box(0, 0), box(1500, 0)];
    const centre = resolveOverlaps(box(350, 0), obstacles);

    for (const obstacle of obstacles) {
      expect(boxesOverlap({ ...box(350, 0), centre }, obstacle)).toBe(false);
    }
  });

  it('в безвыходном положении возвращает хоть что-то, а не зацикливается', () => {
    // Со всех сторон соседи: решения нет, но и зависнуть нельзя
    const trapped = [box(-500, 0), box(500, 0), box(0, -500), box(0, 500)];
    const centre = resolveOverlaps(box(0, 0, { halfWidthMm: 450, halfDepthMm: 450 }), trapped);

    expect(Number.isFinite(centre.x)).toBe(true);
    expect(Number.isFinite(centre.y)).toBe(true);
  });

  it('пустой список препятствий ничего не двигает', () => {
    expect(resolveOverlaps(box(10, 20), [])).toEqual({ x: 10, y: 20 });
  });

  it('объект на столешнице остаётся на месте', () => {
    // Мойка стоит НА столешнице: их габариты пересекаются в плане,
    // но не по высоте
    const worktop = box(0, 0, { bottomMm: 820, topMm: 858, halfWidthMm: 1000 });
    const sink = box(0, 0, { bottomMm: 858, topMm: 1058, halfWidthMm: 250 });

    expect(resolveOverlaps(sink, [worktop])).toEqual({ x: 0, y: 0 });
  });
});
