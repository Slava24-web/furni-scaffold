import { describe, expect, it } from 'vitest';
import { clampToRoom, roomBounds, worldHalfExtents } from './bounds';
import { createRectangularRoom } from './walls';
import type { Room } from './schema';

const room = (): Room => createRectangularRoom({ widthMm: 4000, depthMm: 3200 });

const cabinet = { halfWidthMm: 300, halfDepthMm: 280, rotationDeg: 0 };

describe('границы помещения', () => {
  it('без стен границ нет: в пустой сцене двигать можно куда угодно', () => {
    expect(roomBounds([])).toBeNull();
    expect(roomBounds([{ ...room(), walls: [] }])).toBeNull();
  });

  it('для прямоугольной комнаты это внутренние поверхности стен', () => {
    const bounds = roomBounds([room()])!;
    // 4000 в свету плюс по половине толщины с каждой стороны
    expect(bounds.maxX - bounds.minX).toBe(4000);
    expect(bounds.maxZ - bounds.minZ).toBe(3200);
  });

  it('для нарисованного контура берётся его габарит', () => {
    const value = room();
    const skewed: Room = {
      ...value,
      walls: value.walls.map((wall, index) =>
        index === 0 ? { ...wall, end: { x: wall.end.x, y: wall.end.y + 600 } } : wall,
      ),
    };
    const bounds = roomBounds([skewed])!;

    // Габарит заведомо не меньше самой комнаты: законная позиция
    // не должна запрещаться
    expect(bounds.maxX - bounds.minX).toBeGreaterThanOrEqual(4000);
  });
});

describe('габарит повёрнутого объекта', () => {
  it('без поворота совпадает с половинами сторон', () => {
    expect(worldHalfExtents(cabinet)).toEqual({ x: 300, z: 280 });
  });

  it('поворот на 90° меняет оси местами', () => {
    const turned = worldHalfExtents({ ...cabinet, rotationDeg: 90 });
    expect(turned.x).toBeCloseTo(280, 6);
    expect(turned.z).toBeCloseTo(300, 6);
  });

  it('на 45° объект занимает по осям больше своей стороны', () => {
    // Иначе повёрнутый шкаф уходит углом в стену
    const turned = worldHalfExtents({ halfWidthMm: 300, halfDepthMm: 300, rotationDeg: 45 });
    expect(turned.x).toBeGreaterThan(300);
  });
});

describe('прижатие к границам', () => {
  const bounds = roomBounds([room()])!;

  it('позиция внутри комнаты не меняется', () => {
    expect(clampToRoom({ x: 0, y: 0 }, cabinet, bounds)).toEqual({ x: 0, y: 0 });
  });

  it('уехавший за стену объект прижимается к ней', () => {
    const clamped = clampToRoom({ x: 9000, y: 0 }, cabinet, bounds);
    expect(clamped.x).toBe(bounds.maxX - 300);
  });

  it('прижимается по обеим осям сразу', () => {
    const clamped = clampToRoom({ x: -9000, y: -9000 }, cabinet, bounds);
    expect(clamped.x).toBe(bounds.minX + 300);
    expect(clamped.y).toBe(bounds.minZ + 280);
  });

  it('повёрнутый объект прижимается по своему габариту, а не по ширине', () => {
    const turned = { halfWidthMm: 600, halfDepthMm: 300, rotationDeg: 90 };
    const clamped = clampToRoom({ x: 9000, y: 0 }, turned, bounds);
    expect(clamped.x).toBe(bounds.maxX - 300);
  });

  it('объект крупнее комнаты встаёт по центру, а не прыгает в угол', () => {
    const huge = { halfWidthMm: 5000, halfDepthMm: 5000, rotationDeg: 0 };
    const clamped = clampToRoom({ x: 9000, y: 9000 }, huge, bounds);

    expect(clamped.x).toBeCloseTo((bounds.minX + bounds.maxX) / 2, 6);
    expect(clamped.y).toBeCloseTo((bounds.minZ + bounds.maxZ) / 2, 6);
  });

  it('без границ позиция остаётся как есть', () => {
    expect(clampToRoom({ x: 9000, y: 9000 }, cabinet, null)).toEqual({ x: 9000, y: 9000 });
  });
});
