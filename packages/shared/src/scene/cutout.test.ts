import { describe, expect, it } from 'vitest';
import { cutsInto, subtractRects, type Rect } from './cutout';

const slab: Rect = { x: 0, y: 0, widthMm: 2000, depthMm: 600 };
const area = (pieces: readonly Rect[]): number =>
  pieces.reduce((sum, r) => sum + r.widthMm * r.depthMm, 0);

describe('вырез в плите', () => {
  it('без окон плита остаётся целой', () => {
    expect(subtractRects(slab, [])).toEqual([slab]);
  });

  it('окно посреди плиты даёт четыре полосы', () => {
    const pieces = subtractRects(slab, [{ x: 0, y: 0, widthMm: 500, depthMm: 400 }]);
    expect(pieces).toHaveLength(4);
    // Площадь плиты минус площадь окна
    expect(area(pieces)).toBe(2000 * 600 - 500 * 400);
  });

  it('полосы не перекрываются и не выходят за плиту', () => {
    const pieces = subtractRects(slab, [{ x: 200, y: 50, widthMm: 500, depthMm: 400 }]);

    for (const piece of pieces) {
      expect(piece.x - piece.widthMm / 2).toBeGreaterThanOrEqual(-1000);
      expect(piece.x + piece.widthMm / 2).toBeLessThanOrEqual(1000);
      expect(piece.widthMm).toBeGreaterThan(0);
      expect(piece.depthMm).toBeGreaterThan(0);
    }
    expect(area(pieces)).toBe(2000 * 600 - 500 * 400);
  });

  it('два окна вырезаются оба', () => {
    const pieces = subtractRects(slab, [
      { x: -500, y: 0, widthMm: 500, depthMm: 400 },
      { x: 500, y: 0, widthMm: 580, depthMm: 500 },
    ]);
    expect(area(pieces)).toBe(2000 * 600 - 500 * 400 - 580 * 500);
  });

  it('окно мимо плиты ничего не режет', () => {
    const away = { x: 5000, y: 0, widthMm: 500, depthMm: 400 };
    expect(subtractRects(slab, [away])).toEqual([slab]);
    expect(cutsInto(slab, away)).toBe(false);
  });

  it('окно у самого края не оставляет волоска', () => {
    // Окно вплотную к левому торцу: полосы слева быть не должно
    const pieces = subtractRects(slab, [{ x: -1000, y: 0, widthMm: 400, depthMm: 400 }]);
    expect(pieces.every((piece) => piece.widthMm > 0.5 && piece.depthMm > 0.5)).toBe(true);
    // Половина окна вне плиты, значит вырезано только то, что внутри
    expect(area(pieces)).toBe(2000 * 600 - 200 * 400);
  });

  it('окно во всю глубину разрезает плиту надвое', () => {
    const pieces = subtractRects(slab, [{ x: 0, y: 0, widthMm: 400, depthMm: 600 }]);
    expect(pieces).toHaveLength(2);
    expect(area(pieces)).toBe(2000 * 600 - 400 * 600);
  });
});
