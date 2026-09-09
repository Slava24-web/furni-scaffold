import { describe, expect, it } from 'vitest';
import { boundsMm, mergeGeometries, triangleCount } from './geometry.mjs';
import {
  FRAME_WIDTH,
  MIN_FRAMED_HEIGHT,
  PANEL_RECESS,
  flatFacade,
  panelFacade,
} from './facade.mjs';

const centre = { x: 0, y: 0, z: 0 };
const merged = (parts) => mergeGeometries(parts);

describe('филёнчатый фасад', () => {
  it('собирается из обвязки и филёнки', () => {
    expect(panelFacade(596, 716, 18, centre)).toHaveLength(5);
  });

  it('габарит по ширине и высоте совпадает с заказанным', () => {
    const bounds = boundsMm(merged(panelFacade(596, 716, 18, centre)));
    expect(bounds.widthMm).toBe(596);
    expect(bounds.heightMm).toBe(716);
  });

  it('филёнка утоплена относительно лицевой плоскости рамки', () => {
    const parts = panelFacade(596, 716, 18, centre);
    const panel = parts.at(-1);
    const frontOfFrame = 18 / 2;
    const frontOfPanel = boundsMm(panel).depthMm / 2 + centreZ(panel);

    expect(frontOfFrame - frontOfPanel).toBeCloseTo(PANEL_RECESS, 6);
  });

  it('филёнка заходит под рамку, щели по контуру нет', () => {
    const parts = panelFacade(596, 716, 18, centre);
    const panel = boundsMm(parts.at(-1));
    const opening = 596 - FRAME_WIDTH * 2;

    expect(panel.widthMm).toBeGreaterThan(opening);
  });

  it('узкий фронт ящика собирается плоским: рамка съела бы всю площадь', () => {
    expect(panelFacade(596, MIN_FRAMED_HEIGHT - 1, 18, centre)).toHaveLength(1);
  });

  it('узкий по ширине фасад тоже остаётся плоским', () => {
    expect(panelFacade(FRAME_WIDTH * 2, 716, 18, centre)).toHaveLength(1);
  });

  it('строится вокруг переданного центра', () => {
    const parts = panelFacade(596, 716, 18, { x: 100, y: 400, z: 300 });
    const bounds = boundsMm(merged(parts));
    expect(bounds.minYMm).toBe(400 - 716 / 2);
  });

  it('дешевле скруглённой плиты по треугольникам', () => {
    // Пять брусков против сегментированной оболочки
    expect(triangleCount(merged(panelFacade(596, 716, 18, centre)))).toBeLessThan(
      triangleCount(merged(flatFacade(596, 716, 18, centre))),
    );
  });
});

describe('плоский фасад', () => {
  it('это одна деталь заданного габарита', () => {
    const parts = flatFacade(596, 176, 18, centre);
    expect(parts).toHaveLength(1);
    expect(boundsMm(merged(parts)).widthMm).toBe(596);
  });
});

/** Центр детали по оси Z. */
function centreZ(part) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 2; i < part.positions.length; i += 3) {
    min = Math.min(min, part.positions[i]);
    max = Math.max(max, part.positions[i]);
  }
  return ((min + max) / 2) * 1000;
}
