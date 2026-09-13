import { describe, expect, it } from 'vitest';
import { boxAxes, boxCorners, insideBox, normalizeAngleDeg, placementBox, planAngleDeg, verticallyOverlapping, type Box } from './box';

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

describe('пересечение по высоте', () => {
  it('модули одного ряда пересекаются по высоте', () => {
    expect(verticallyOverlapping({ bottomMm: 0, topMm: 820 }, { bottomMm: 0, topMm: 820 })).toBe(true);
  });

  it('столешница над тумбой по высоте не пересекается', () => {
    expect(verticallyOverlapping({ bottomMm: 0, topMm: 820 }, { bottomMm: 820, topMm: 858 })).toBe(
      false,
    );
  });

  it('верхний шкаф над нижним по высоте не пересекается', () => {
    expect(verticallyOverlapping({ bottomMm: 0, topMm: 820 }, { bottomMm: 1450, topMm: 2170 })).toBe(
      false,
    );
  });

  it('пенал пересекается и с нижним, и с верхним рядом', () => {
    const tall = { bottomMm: 0, topMm: 2240 };
    expect(verticallyOverlapping(tall, { bottomMm: 0, topMm: 820 })).toBe(true);
    expect(verticallyOverlapping(tall, { bottomMm: 1450, topMm: 2170 })).toBe(true);
  });
});

describe('углы в плане', () => {
  it('ноль соответствует направлению +Z', () => {
    expect(planAngleDeg(0, 1)).toBe(0);
  });

  it('90 градусов соответствует направлению +X', () => {
    expect(planAngleDeg(1, 0)).toBe(90);
  });

  it('обратные направления дают 180 и -90', () => {
    expect(Math.abs(planAngleDeg(0, -1))).toBe(180);
    expect(planAngleDeg(-1, 0)).toBe(-90);
  });

  it('согласован с разворотом объекта: угол задаёт направление локальной +Z', () => {
    for (const angle of [0, 37, 90, 145, -63]) {
      const { forward } = boxAxes({ rotationDeg: angle });
      expect(normalizeAngleDeg(planAngleDeg(forward.x, forward.y) - angle)).toBeCloseTo(0, 6);
    }
  });

  it('приведение угла укладывает значение в (-180, 180]', () => {
    expect(normalizeAngleDeg(0)).toBe(0);
    expect(normalizeAngleDeg(370)).toBe(10);
    expect(normalizeAngleDeg(-370)).toBe(-10);
    expect(normalizeAngleDeg(540)).toBe(180);
    expect(normalizeAngleDeg(-180)).toBe(180);
  });

  it('разница углов через ноль не даёт скачка на 360', () => {
    // Поворот через границу: с 179 на -179 это два градуса, а не 358
    expect(normalizeAngleDeg(-179 - 179)).toBe(2);
  });
});

describe('точка внутри габарита', () => {
  it('центр внутри, дальняя точка снаружи', () => {
    expect(insideBox(cabinet(), { x: 0, y: 0 })).toBe(true);
    expect(insideBox(cabinet(), { x: 1000, y: 0 })).toBe(false);
  });

  it('граница считается попаданием', () => {
    expect(insideBox(cabinet(), { x: 300, y: 300 })).toBe(true);
  });

  it('учитывает разворот габарита', () => {
    const narrow = cabinet({ halfWidthMm: 1000, halfDepthMm: 100, rotationDeg: 90 });
    // Длинная сторона развёрнута вдоль оси Z плана
    expect(insideBox(narrow, { x: 0, y: 800 })).toBe(true);
    expect(insideBox(narrow, { x: 800, y: 0 })).toBe(false);
  });
});
