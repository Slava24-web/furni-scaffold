import { describe, expect, it } from 'vitest';
import { boundsMm, mergeGeometries, triangleCount } from './geometry.mjs';
import { PANEL_THICKNESS, carcassPanels, openBoxPanels } from './carcass.mjs';

const merged = (parts) => mergeGeometries(parts);

describe('корпус из панелей', () => {
  it('собирается из боковин, дна, крышки и задней стенки', () => {
    expect(carcassPanels(600, 720, 560)).toHaveLength(5);
  });

  it('габарит совпадает с заказанным', () => {
    const bounds = boundsMm(merged(carcassPanels(600, 720, 560)));
    expect(bounds).toMatchObject({ widthMm: 600, heightMm: 720, depthMm: 560 });
  });

  it('стоит на полу, а не висит', () => {
    expect(boundsMm(merged(carcassPanels(600, 720, 560))).minYMm).toBe(0);
  });

  it('поднимается на цоколь', () => {
    const bounds = boundsMm(merged(carcassPanels(600, 720, 560, { bottomMm: 100 })));
    expect(bounds.minYMm).toBe(100);
    expect(bounds.heightMm).toBe(720);
  });

  it('внутри действительно пусто: объём панелей много меньше габарита', () => {
    // Грубая проверка через число деталей и их толщину: сплошной брусок
    // дал бы одну деталь на весь объём
    const parts = carcassPanels(600, 720, 560);
    const widths = parts.map((part) => boundsMm(part).widthMm);
    expect(Math.min(...widths)).toBe(PANEL_THICKNESS);
  });

  it('открытый верх убирает крышку', () => {
    expect(carcassPanels(600, 720, 560, { openTop: true })).toHaveLength(4);
  });

  it('открытая задняя стенка убирает панель', () => {
    expect(carcassPanels(600, 720, 560, { openBack: true })).toHaveLength(4);
  });

  it('полки добавляются внутрь и не выходят за габарит', () => {
    const withShelves = carcassPanels(600, 720, 560, { shelves: 2 });
    expect(withShelves).toHaveLength(7);

    const bounds = boundsMm(merged(withShelves));
    expect(bounds).toMatchObject({ widthMm: 600, heightMm: 720, depthMm: 560 });
  });

  it('панелей заметно больше треугольников, чем у бруска, но немного', () => {
    // Корпус обязан оставаться дешёвым: он попадает в каждый модуль сцены
    expect(triangleCount(merged(carcassPanels(600, 720, 560)))).toBeLessThan(120);
  });
});

describe('открытый короб', () => {
  it('две боковины, дно и задний борт: перед закрывает фасад ящика', () => {
    expect(openBoxPanels(600, 176, 500)).toHaveLength(4);
  });

  it('габарит совпадает с заказанным', () => {
    const bounds = boundsMm(merged(openBoxPanels(600, 176, 500)));
    expect(bounds).toMatchObject({ widthMm: 600, heightMm: 176, depthMm: 500 });
  });
});
