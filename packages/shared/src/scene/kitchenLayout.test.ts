import { describe, expect, it } from 'vitest';
import { KITCHEN_LAYOUTS, buildKitchen } from './kitchenLayout';
import { createRectangularRoom } from './walls';
import { boxesOverlap, placementBox } from './collision';
import { worldHalfExtents } from './bounds';
import type { CatalogProduct } from '../catalog/schema';

const product = (
  sku: string,
  role: CatalogProduct['role'],
  widthMm: number,
  heightMm: number,
  depthMm: number,
  extra: Partial<CatalogProduct> = {},
): CatalogProduct =>
  ({ sku, name: sku, role, widthMm, heightMm, depthMm, mountHeightMm: 0, ...extra }) as CatalogProduct;

const catalog: CatalogProduct[] = [
  product('BASE-800', 'base', 800, 820, 618),
  product('BASE-600', 'base', 600, 820, 618),
  product('WALL-800', 'wall', 800, 720, 378, { mountHeightMm: 1450 }),
  product('TOP-2000', 'worktop', 2000, 98, 600, { mountHeightMm: 820, surfaceHeightMm: 38 }),
  product('TOP-1200', 'worktop', 1200, 98, 600, { mountHeightMm: 820, surfaceHeightMm: 38 }),
  product('SINK', 'sink', 552, 472, 498),
  product('HOB', 'hob', 580, 17, 510),
];

const room = (widthMm = 4000, depthMm = 3200) => createRectangularRoom({ widthMm, depthMm });

const roleOf = (sku: string): CatalogProduct['role'] =>
  catalog.find((item) => item.sku === sku)!.role;

describe('готовые сценарии кухни', () => {
  it('сценариев несколько и все с описанием', () => {
    expect(KITCHEN_LAYOUTS.length).toBeGreaterThanOrEqual(3);
    for (const layout of KITCHEN_LAYOUTS) {
      expect(layout.name.length).toBeGreaterThan(0);
      expect(layout.description.length).toBeGreaterThan(0);
    }
  });

  it('прямая кухня собирается в один ряд', () => {
    const { placements, problems } = buildKitchen('linear', room(), catalog);

    expect(problems).toEqual([]);
    expect(placements.filter((p) => roleOf(p.sku) === 'base').length).toBeGreaterThanOrEqual(4);
  });

  it('угловая занимает две стены', () => {
    const linear = buildKitchen('linear', room(), catalog).placements;
    const corner = buildKitchen('corner', room(), catalog).placements;

    expect(corner.length).toBeGreaterThan(linear.length);
    // Модули второго ряда развёрнуты иначе, чем первого
    const rotations = new Set(corner.map((p) => p.rotationY));
    expect(rotations.size).toBeGreaterThan(1);
  });

  it('П-образная занимает три стены', () => {
    const shape = buildKitchen('u-shape', room(4200, 3400), catalog).placements;
    // Три ряда — три разных разворота модулей
    const rotations = new Set(shape.map((placement) => placement.rotationY));
    expect(rotations.size).toBeGreaterThanOrEqual(3);
  });

  it('модули не налезают друг на друга', () => {
    const { placements } = buildKitchen('u-shape', room(4200, 3400), catalog);
    const boxes = placements.map((placement) => ({
      placement,
      box: placementBox(placement, catalog.find((item) => item.sku === placement.sku)!),
    }));

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(boxesOverlap(boxes[i]!.box, boxes[j]!.box)).toBe(false);
      }
    }
  });

  it('всё стоит внутри помещения', () => {
    const value = room();
    const { placements } = buildKitchen('corner', value, catalog);

    for (const placement of placements) {
      const box = placementBox(placement, catalog.find((item) => item.sku === placement.sku)!);
      // Габарит по мировым осям: повёрнутый модуль занимает иначе
      const half = worldHalfExtents(box);
      expect(Math.abs(box.centre.x) + half.x).toBeLessThanOrEqual(2100);
      expect(Math.abs(box.centre.y) + half.z).toBeLessThanOrEqual(1700);
    }
  });

  it('столешница ложится на нижний ряд, а мойка — на столешницу', () => {
    const { placements } = buildKitchen('linear', room(), catalog);
    const worktop = placements.find((p) => roleOf(p.sku) === 'worktop')!;
    const sink = placements.find((p) => roleOf(p.sku) === 'sink')!;

    expect(worktop.position.y).toBe(820);
    // 820 + 38: плинтус столешницы в рабочую поверхность не входит
    expect(sink.position.y).toBe(858);
  });

  it('навесные шкафы висят на своей отметке и только над главным рядом', () => {
    const { placements } = buildKitchen('u-shape', room(), catalog);
    const walls = placements.filter((p) => roleOf(p.sku) === 'wall');

    expect(walls.length).toBeGreaterThan(0);
    for (const wall of walls) expect(wall.position.y).toBe(1450);
    // Все верхние смотрят в одну сторону: они над одной стеной
    expect(new Set(walls.map((wall) => wall.rotationY)).size).toBe(1);
  });

  it('мойка и плита разнесены по ряду', () => {
    const { placements } = buildKitchen('corner', room(), catalog);
    const sink = placements.find((p) => roleOf(p.sku) === 'sink')!;
    const hob = placements.find((p) => roleOf(p.sku) === 'hob')!;

    const gap = Math.hypot(sink.position.x - hob.position.x, sink.position.z - hob.position.z);
    expect(gap).toBeGreaterThan(600);
  });

  it('в тесной комнате П-образная не собирается и говорит почему', () => {
    const { placements, problems } = buildKitchen('u-shape', room(2000, 1900), catalog);

    expect(placements).toEqual([]);
    expect(problems.join(' ')).toContain('мал');
  });

  it('без нижних модулей в каталоге кухня не собирается', () => {
    const { placements, problems } = buildKitchen('linear', room(), [catalog[3]!]);
    expect(placements).toEqual([]);
    expect(problems.join(' ')).toContain('нижних модулей');
  });

  it('идентификаторы размещений уникальны', () => {
    const { placements } = buildKitchen('corner', room(), catalog);
    expect(new Set(placements.map((p) => p.instanceId)).size).toBe(placements.length);
  });
});
