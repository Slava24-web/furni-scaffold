import { describe, expect, it } from 'vitest';
import { planOpening } from './openingPlacement';
import { createRectangularRoom, wallLengthMm } from './walls';

const room = () => createRectangularRoom({ widthMm: 4000, depthMm: 3200 });

describe('место проёма по точке прицела', () => {
  it('выбирается ближайшая стена', () => {
    const value = room();
    // Точка у нижней стены: она и должна быть выбрана
    const plan = planOpening(value, { x: 0, y: -1500 }, 900)!;
    const expected = value.walls.find((wall) => wall.start.y === wall.end.y && wall.start.y < 0);

    expect(plan.wall.id).toBe(expected!.id);
  });

  it('проём центрируется по точке', () => {
    const value = room();
    const plan = planOpening(value, { x: 0, y: -1500 }, 900)!;
    const length = wallLengthMm(plan.wall);

    // Точка лежит на середине стены: центр проёма обязан совпасть с ней
    expect(plan.offsetMm + plan.widthMm / 2).toBeCloseTo(length / 2, 0);
  });

  it('проём прижимается к торцу стены, а не вылезает за него', () => {
    const value = room();
    const plan = planOpening(value, { x: -2500, y: -1500 }, 900)!;

    expect(plan.offsetMm).toBeGreaterThanOrEqual(0);
    expect(plan.offsetMm + plan.widthMm).toBeLessThanOrEqual(Math.round(wallLengthMm(plan.wall)));
  });

  it('проём шире стены ужимается до её длины', () => {
    const value = room();
    const plan = planOpening(value, { x: 0, y: -1500 }, 99000)!;

    expect(plan.widthMm).toBe(Math.round(wallLengthMm(plan.wall)));
    expect(plan.offsetMm).toBe(0);
  });

  it('в помещении без стен места нет', () => {
    expect(planOpening({ ...room(), walls: [] }, { x: 0, y: 0 }, 900)).toBeNull();
  });
});
