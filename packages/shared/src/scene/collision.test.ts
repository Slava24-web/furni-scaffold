import { describe, expect, it } from 'vitest';
import {
  boxAxes,
  boxCorners,
  boxesOverlap,
  dockCandidates,
  findConflicts,
  hasConflicts,
  isInsideContour,
  placementBox,
  wallToBox,
  type Box,
} from './collision';
import { createRectangularRoom } from './walls';
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

describe('оси и углы габарита', () => {
  it('без поворота локальные оси совпадают с осями плана', () => {
    const { right, forward } = boxAxes({ rotationDeg: 0 });
    expect(right.x).toBeCloseTo(1, 9);
    expect(right.y).toBeCloseTo(0, 9);
    expect(forward.x).toBeCloseTo(0, 9);
    expect(forward.y).toBeCloseTo(1, 9);
  });

  it('поворот на 90° разворачивает оси', () => {
    const { right, forward } = boxAxes({ rotationDeg: 90 });
    expect(right.x).toBeCloseTo(0, 9);
    expect(right.y).toBeCloseTo(-1, 9);
    expect(forward.x).toBeCloseTo(1, 9);
    expect(forward.y).toBeCloseTo(0, 9);
  });

  it('оси остаются перпендикулярными при любом угле', () => {
    for (const rotationDeg of [0, 37, 90, 145, 270, -63]) {
      const { right, forward } = boxAxes({ rotationDeg });
      expect(right.x * forward.x + right.y * forward.y).toBeCloseTo(0, 9);
    }
  });

  it('углы лежат на габарите', () => {
    const corners = boxCorners(cabinet());
    expect(corners).toHaveLength(4);
    expect(Math.max(...corners.map((c) => c.x))).toBeCloseTo(300, 6);
    expect(Math.min(...corners.map((c) => c.y))).toBeCloseTo(-300, 6);
  });
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

describe('точки стыковки', () => {
  it('даёт четыре стороны', () => {
    const sides = dockCandidates(cabinet(), 300, 300).map((c) => c.side);
    expect(sides.sort()).toEqual(['back', 'front', 'left', 'right']);
  });

  it('сосед встаёт грань в грань', () => {
    const [rightSide] = dockCandidates(cabinet(), 400, 300);
    // 300 своей половины плюс 400 половины соседа
    expect(rightSide?.position).toEqual({ x: 700, y: 0 });
  });

  it('состыкованные объекты не пересекаются', () => {
    const target = cabinet();
    for (const candidate of dockCandidates(target, 400, 250)) {
      const moved = cabinet({
        centre: candidate.position,
        halfWidthMm: 400,
        halfDepthMm: 250,
        rotationDeg: candidate.rotationDeg,
      });
      expect(boxesOverlap(target, moved)).toBe(false);
    }
  });

  it('разворот наследуется от соседа: ряд смотрит в одну сторону', () => {
    const rotated = cabinet({ rotationDeg: 90 });
    for (const candidate of dockCandidates(rotated, 300, 300)) {
      expect(candidate.rotationDeg).toBe(90);
    }
  });

  it('у повёрнутого соседа стыковка идёт вдоль его осей', () => {
    const rotated = cabinet({ rotationDeg: 90 });
    const right = dockCandidates(rotated, 300, 300).find((c) => c.side === 'right');
    // Локальная +X при повороте на 90° смотрит в −Z плана
    expect(right?.position.x).toBeCloseTo(0, 6);
    expect(right?.position.y).toBeCloseTo(-600, 6);
  });
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

describe('габарит размещения', () => {
  const size = { widthMm: 600, heightMm: 720, depthMm: 380 };

  it('низ берётся из высоты установки', () => {
    const box = placementBox(
      { position: { x: 100, y: 1450, z: -200 }, rotationY: 90 },
      size,
    );

    expect(box.centre).toEqual({ x: 100, y: -200 });
    expect(box.bottomMm).toBe(1450);
    expect(box.topMm).toBe(2170);
    expect(box.rotationDeg).toBe(90);
    expect(box.halfWidthMm).toBe(300);
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
