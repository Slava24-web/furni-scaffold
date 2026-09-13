import { describe, expect, it } from 'vitest';
import type { Box } from './box';
import { boxesOverlap, wallToBox } from './overlap';
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

describe('пересечение габаритов', () => {
  it('совпадающие объекты пересекаются', () => {
    expect(boxesOverlap(cabinet(), cabinet())).toBe(true);
  });

  it('разнесённые объекты не пересекаются', () => {
    expect(boxesOverlap(cabinet(), cabinet({ centre: { x: 1000, y: 0 } }))).toBe(false);
  });

  it('поставленные вплотную не считаются пересечением', () => {
    // Ровно грань в грань: 300 + 300 = 600
    expect(boxesOverlap(cabinet(), cabinet({ centre: { x: 600, y: 0 } }))).toBe(false);
  });

  it('наезд на миллиметры ловится', () => {
    expect(boxesOverlap(cabinet(), cabinet({ centre: { x: 560, y: 0 } }))).toBe(true);
  });

  it('верхний шкаф над нижним не конфликтует', () => {
    // Главный случай: в плане они совпадают, но висят на разной высоте
    const wall = cabinet({ bottomMm: 1450, topMm: 2170, halfDepthMm: 190 });
    expect(boxesOverlap(cabinet(), wall)).toBe(false);
  });

  it('столешница лежит на модуле, а не врезается в него', () => {
    const worktop = cabinet({ bottomMm: 820, topMm: 858, halfDepthMm: 300 });
    expect(boxesOverlap(cabinet(), worktop)).toBe(false);
  });

  it('пенал перекрывает верхний шкаф по высоте', () => {
    const tall = cabinet({ topMm: 2240 });
    const upper = cabinet({ bottomMm: 1450, topMm: 2170, halfDepthMm: 190 });
    expect(boxesOverlap(tall, upper)).toBe(true);
  });

  it('повёрнутые прямоугольники: угол одного внутри другого', () => {
    const straight = cabinet({ halfWidthMm: 1000, halfDepthMm: 200 });
    const diagonal = cabinet({
      centre: { x: 900, y: 0 },
      halfWidthMm: 800,
      halfDepthMm: 200,
      rotationDeg: 45,
    });
    expect(boxesOverlap(straight, diagonal)).toBe(true);
  });

  it('повёрнутые прямоугольники: разделяющая ось найдена', () => {
    const straight = cabinet({ halfWidthMm: 400, halfDepthMm: 200 });
    const diagonal = cabinet({
      centre: { x: 1600, y: 1600 },
      halfWidthMm: 400,
      halfDepthMm: 200,
      rotationDeg: 45,
    });
    expect(boxesOverlap(straight, diagonal)).toBe(false);
  });
});

describe('стена как габарит', () => {
  const wall: Wall = {
    id: '11111111-1111-4111-8111-111111111111',
    start: { x: -2000, y: 0 },
    end: { x: 2000, y: 0 },
    thickness: 100,
    height: 2700,
    materialId: null,
  };

  it('центр и размеры берутся с осевой линии', () => {
    const box = wallToBox(wall);
    expect(box.centre).toEqual({ x: 0, y: 0 });
    expect(box.halfWidthMm).toBe(2000);
    expect(box.halfDepthMm).toBe(50);
  });

  it('модуль, стоящий вплотную, стену не задевает', () => {
    // Грань стены на y = 50, полуглубина модуля 300 -> центр на 350
    expect(boxesOverlap(wallToBox(wall), cabinet({ centre: { x: 0, y: 350 } }))).toBe(false);
  });

  it('модуль, наехавший на стену, ловится', () => {
    expect(boxesOverlap(wallToBox(wall), cabinet({ centre: { x: 0, y: 200 } }))).toBe(true);
  });

  it('наклонная стена тоже работает', () => {
    const diagonal: Wall = { ...wall, start: { x: 0, y: 0 }, end: { x: 2000, y: 2000 } };
    const box = wallToBox(diagonal);
    expect(boxesOverlap(box, cabinet({ centre: { x: 1000, y: 1000 } }))).toBe(true);
    expect(boxesOverlap(box, cabinet({ centre: { x: 3000, y: 0 } }))).toBe(false);
  });
});
