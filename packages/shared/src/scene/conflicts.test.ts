import { describe, expect, it } from 'vitest';
import type { Box } from './box';
import { findConflicts, hasConflicts } from './conflicts';
import { createRectangularRoom, isInsideContour } from './walls';
import type { Wall } from './schema';

/** Нижний кухонный модуль 600×820×600, стоящий на полу. */
const cabinet = (over: Partial<Box> = {}): Box => ({
  centre: { x: 0, y: 0 },
  halfWidthMm: 300,
  halfDepthMm: 300,
  rotationDeg: 0,
  bottomMm: 0,
  topMm: 820,
  ...over,
});

describe('точка внутри контура', () => {
  const room = createRectangularRoom({ widthMm: 4000, depthMm: 3000 });

  it('центр комнаты внутри', () => {
    expect(isInsideContour({ x: 0, y: 0 }, room.walls)).toBe(true);
  });

  it('точка снаружи не внутри', () => {
    expect(isInsideContour({ x: 5000, y: 0 }, room.walls)).toBe(false);
    expect(isInsideContour({ x: 0, y: -4000 }, room.walls)).toBe(false);
  });

  it('незамкнутый контур из двух стен не образует помещения', () => {
    expect(isInsideContour({ x: 0, y: 0 }, room.walls.slice(0, 2))).toBe(false);
  });

  it('невыпуклый контур обрабатывается верно', () => {
    // Г-образная комната: вырез в правом верхнем углу
    const points = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 2000 },
      { x: 2000, y: 2000 },
      { x: 2000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    const walls: Wall[] = points.map((start, index) => ({
      id: `${index}`,
      start,
      end: points[(index + 1) % points.length]!,
      thickness: 100,
      height: 2700,
      materialId: null,
    }));

    expect(isInsideContour({ x: 1000, y: 3000 }, walls)).toBe(true);
    expect(isInsideContour({ x: 3000, y: 1000 }, walls)).toBe(true);
    // Точка в вырезе: габаритный прямоугольник счёл бы её внутренней
    expect(isInsideContour({ x: 3000, y: 3000 }, walls)).toBe(false);
  });
});

describe('поиск конфликтов', () => {
  const room = createRectangularRoom({ widthMm: 4000, depthMm: 3000 });
  const other = (id: string, x: number, z: number) => ({
    id,
    box: cabinet({ centre: { x, y: z } }),
  });

  it('чистая расстановка конфликтов не даёт', () => {
    const report = findConflicts(cabinet({ centre: { x: 0, y: 0 } }), [other('a', 1000, 0)], room.walls);
    expect(hasConflicts(report)).toBe(false);
  });

  it('наложение на соседа попадает в отчёт', () => {
    const report = findConflicts(cabinet(), [other('a', 400, 0)], room.walls);
    expect(report.objectIds).toEqual(['a']);
    expect(hasConflicts(report)).toBe(true);
  });

  it('состыкованные вплотную конфликтом не считаются', () => {
    const report = findConflicts(cabinet(), [other('a', 600, 0)], room.walls);
    expect(report.objectIds).toEqual([]);
  });

  it('врезание в стену попадает в отчёт', () => {
    // Внутренняя грань северной стены на z = -1450
    const report = findConflicts(cabinet({ centre: { x: 0, y: -1500 } }), [], room.walls);
    expect(report.wallIds).toHaveLength(1);
  });

  it('объект за пределами помещения помечается', () => {
    const report = findConflicts(cabinet({ centre: { x: 9000, y: 0 } }), [], room.walls);
    expect(report.outsideRoom).toBe(true);
  });

  it('без замкнутого контура выход наружу не проверяется', () => {
    // Пока стены рисуются, ломаная помещения не образует
    const report = findConflicts(cabinet({ centre: { x: 9000, y: 0 } }), [], room.walls.slice(0, 2));
    expect(report.outsideRoom).toBe(false);
  });

  it('сообщает обо всех конфликтующих соседях сразу', () => {
    const report = findConflicts(cabinet(), [other('a', 300, 0), other('b', -300, 0)], room.walls);
    expect(report.objectIds.sort()).toEqual(['a', 'b']);
  });

  it('верхний шкаф над нижним конфликтом не считается', () => {
    const upper = cabinet({ bottomMm: 1450, topMm: 2170, halfDepthMm: 190 });
    const report = findConflicts(upper, [other('base', 0, 0)], room.walls);
    expect(hasConflicts(report)).toBe(false);
  });
});
