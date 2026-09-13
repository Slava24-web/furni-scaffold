import { describe, expect, it } from 'vitest';
import {
  allSwings,
  allWalls,
  boxOf,
  confine,
  drawerZoneOf,
  neighbourBoxes,
  neighbourDrawerZones,
} from './sceneBoxes';
import {
  boxesOverlap,
  createRectangularRoom,
  randomUUID,
  roomBounds,
  type CatalogProduct,
  type Opening,
  type Placement,
  type Room,
} from '@furni/shared';

const product = (over: Partial<CatalogProduct> = {}): CatalogProduct =>
  ({
    sku: 'BASE',
    name: 'Нижний шкаф',
    widthMm: 600,
    heightMm: 820,
    depthMm: 600,
    resize: {},
    drawerCount: 0,
    drawerTravelMm: 0,
    ...over,
  }) as CatalogProduct;

const products = new Map<string, CatalogProduct>([
  ['BASE', product()],
  ['DRW', product({ sku: 'DRW', drawerCount: 3, drawerTravelMm: 400 })],
]);

const at = (sku: string, x: number, z: number, id = randomUUID()): Placement =>
  ({
    instanceId: id,
    sku,
    position: { x, y: 0, z },
    rotationY: 0,
    options: {},
    params: {},
    size: {},
  }) as Placement;

function roomWithDoor(): Room {
  const room = createRectangularRoom({ widthMm: 4000, depthMm: 3200 });
  const door: Opening = {
    id: randomUUID(),
    wallId: room.walls[0]!.id,
    kind: 'door',
    offset: 800,
    width: 900,
    height: 2000,
    sillHeight: 0,
    swingRadius: null,
    hinge: 'left',
    swingInward: true,
    sku: null,
    options: {},
  };
  return { ...room, openings: [door] };
}

describe('габариты сцены', () => {
  it('стены собираются со всех помещений', () => {
    expect(allWalls([createRectangularRoom({ widthMm: 3000, depthMm: 3000 })])).toHaveLength(4);
    expect(allWalls([])).toEqual([]);
  });

  it('зоны открывания берутся только у дверей', () => {
    expect(allSwings([roomWithDoor()])).toHaveLength(1);
    expect(allSwings([createRectangularRoom({ widthMm: 3000, depthMm: 3000 })])).toEqual([]);
  });

  it('товар не из каталога габарита не имеет', () => {
    expect(boxOf(at('НЕТ', 0, 0), products)).toBeNull();
  });

  it('габарит считается по заказанному размеру', () => {
    const stretched = { ...at('BASE', 0, 0), size: { widthMm: 900 } } as Placement;
    const wide = boxOf(stretched, new Map([['BASE', product({ resize: { maxWidthMm: 1000 } })]]));
    expect(wide?.halfWidthMm).toBe(450);
  });

  it('соседи исключают сам объект', () => {
    const first = at('BASE', 0, 0);
    const boxes = neighbourBoxes([first, at('BASE', 2000, 0)], products, first.instanceId);

    expect(boxes).toHaveLength(1);
    expect(boxes[0]?.instanceId).not.toBe(first.instanceId);
  });

  it('зона выдвижения есть только у изделия с ящиками', () => {
    expect(drawerZoneOf(at('BASE', 0, 0), products)).toBeNull();
    expect(drawerZoneOf(at('DRW', 0, 0), products)).not.toBeNull();
  });

  it('зоны соседей исключают сам объект', () => {
    const drawer = at('DRW', 0, 0);
    expect(neighbourDrawerZones([drawer], products, drawer.instanceId)).toEqual([]);
    expect(neighbourDrawerZones([drawer], products, null)).toHaveLength(1);
  });
});

describe('удержание объекта в комнате', () => {
  const bounds = roomBounds([createRectangularRoom({ widthMm: 4000, depthMm: 3200 })]);
  const footprint = {
    halfWidthMm: 300,
    halfDepthMm: 300,
    rotationDeg: 0,
    bottomMm: 0,
    topMm: 820,
  };

  it('свободная позиция не меняется', () => {
    const inside = confine({ x: 0, y: 0 }, { ...footprint, obstacles: [], bounds });
    expect(inside).toEqual({ x: 0, y: 0 });
  });

  it('за стеной объект прижимается к ней', () => {
    const inside = confine({ x: 9000, y: 0 }, { ...footprint, obstacles: [], bounds });
    expect(inside.x).toBe(bounds!.maxX - 300);
  });

  it('из соседа объект выталкивается', () => {
    const neighbour = boxOf(at('BASE', 0, 0), products)!;
    const inside = confine({ x: 200, y: 0 }, { ...footprint, obstacles: [neighbour], bounds });

    expect(boxesOverlap({ ...footprint, centre: inside }, neighbour)).toBe(false);
  });

  it('выталкивание не выносит объект за стену', () => {
    // Сосед прижат к правой стене: выйти можно только влево
    const neighbour = boxOf(at('BASE', 1700, 0), products)!;
    const inside = confine({ x: 1750, y: 0 }, { ...footprint, obstacles: [neighbour], bounds });

    expect(inside.x).toBeLessThanOrEqual(bounds!.maxX - 300);
    expect(inside.x).toBeGreaterThanOrEqual(bounds!.minX + 300);
  });

  it('без границ и соседей позиция остаётся как есть', () => {
    expect(confine({ x: 9000, y: 9000 }, { ...footprint, obstacles: [], bounds: null })).toEqual({
      x: 9000,
      y: 9000,
    });
  });
});
