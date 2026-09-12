import { describe, expect, it } from 'vitest';
import { PLAN_DIMENSION_OFFSET_MM, planGeometry } from './plan2d';
import { createRectangularRoom } from '../scene/walls';
import { emptySceneDoc, type Opening, type SceneDoc, type ServicePoint } from '../scene/schema';
import { randomUUID } from '../scene/uuid';
import type { CatalogProduct } from '../catalog/schema';

const product = (over: Partial<CatalogProduct> = {}): CatalogProduct =>
  ({
    sku: 'BASE',
    name: 'Нижний шкаф 600',
    role: 'base',
    widthMm: 600,
    heightMm: 820,
    depthMm: 560,
    resize: {},
    ...over,
  }) as CatalogProduct;

const catalog = new Map<string, CatalogProduct>([
  ['BASE', product()],
  ['WALL', product({ sku: 'WALL', name: 'Верхний шкаф', role: 'wall', heightMm: 720, depthMm: 378 })],
]);

const opening = (kind: Opening['kind'], wallId: string): Opening => ({
  id: randomUUID(),
  wallId,
  kind,
  offset: 800,
  width: 900,
  height: 2000,
  sillHeight: kind === 'window' ? 850 : 0,
  swingRadius: null,
  hinge: 'left',
  swingInward: true,
  sku: null,
  options: {},
});

function doc(over: Partial<SceneDoc> = {}): SceneDoc {
  const room = createRectangularRoom({ widthMm: 4000, depthMm: 3200 });
  return { ...emptySceneDoc(), rooms: [room], ...over };
}

const place = (sku: string, yMm = 0) => ({
  instanceId: randomUUID(),
  productId: randomUUID(),
  sku,
  position: { x: 0, y: yMm, z: -1000 },
  rotationY: 0,
  options: {},
  params: {},
  size: {},
  anchoredToWallId: null,
  locked: false,
});

describe('план сверху', () => {
  it('пустая сцена плана не даёт', () => {
    const plan = planGeometry(emptySceneDoc(), catalog);
    expect(plan.bounds).toBeNull();
    expect(plan.areaSqm).toBe(0);
  });

  it('каждая стена — четырёхугольник по толщине', () => {
    const plan = planGeometry(doc(), catalog);
    expect(plan.walls).toHaveLength(4);
    for (const wall of plan.walls) expect(wall.corners).toHaveLength(4);
  });

  it('площадь считается по контуру', () => {
    // Осевой контур 4100 × 3300
    expect(planGeometry(doc(), catalog).areaSqm).toBeCloseTo(13.53, 1);
  });

  it('у двери есть дуга открывания, у окна нет', () => {
    const base = doc();
    const wallId = base.rooms[0]!.walls[0]!.id;
    const withBoth: SceneDoc = {
      ...base,
      rooms: [
        { ...base.rooms[0]!, openings: [opening('door', wallId), opening('window', wallId)] },
      ],
    };

    const plan = planGeometry(withBoth, catalog);
    const door = plan.openings.find((item) => item.kind === 'door')!;
    const window = plan.openings.find((item) => item.kind === 'window')!;

    expect(door.arc.length).toBeGreaterThan(2);
    expect(window.arc).toEqual([]);
  });

  it('проём вырезан по толщине стены', () => {
    const base = doc();
    const wallId = base.rooms[0]!.walls[0]!.id;
    const plan = planGeometry(
      { ...base, rooms: [{ ...base.rooms[0]!, openings: [opening('door', wallId)] }] },
      catalog,
    );

    expect(plan.openings[0]?.corners).toHaveLength(4);
    expect(plan.openings[0]?.widthMm).toBe(900);
  });

  it('навесной модуль помечен отдельно: на плане он пунктиром', () => {
    const plan = planGeometry(
      doc({ placements: [place('BASE'), place('WALL', 1450)] as never }),
      catalog,
    );

    expect(plan.items.find((item) => item.sku === 'BASE')?.mounted).toBe(false);
    expect(plan.items.find((item) => item.sku === 'WALL')?.mounted).toBe(true);
  });

  it('подписи верхнего и нижнего модулей разведены', () => {
    const plan = planGeometry(
      doc({ placements: [place('BASE'), place('WALL', 1450)] as never }),
      catalog,
    );
    const base = plan.items.find((item) => item.sku === 'BASE')!;
    const wall = plan.items.find((item) => item.sku === 'WALL')!;

    // Стоят в одной точке, а подписи — нет
    expect(base.centre).toEqual(wall.centre);
    expect(base.labelAt.y).not.toBeCloseTo(wall.labelAt.y, 1);
  });

  it('товар не из каталога на план не попадает', () => {
    expect(planGeometry(doc({ placements: [place('НЕТ')] as never }), catalog).items).toEqual([]);
  });

  it('размеры выносятся наружу помещения', () => {
    const plan = planGeometry(doc(), catalog);
    const inner = 3200 / 2;

    // Линия дальше внутренней поверхности стены, а не внутри комнаты
    for (const dimension of plan.dimensions) {
      const distance = Math.max(Math.abs(dimension.labelAt.x), Math.abs(dimension.labelAt.y));
      expect(distance).toBeGreaterThan(inner);
    }
    expect(PLAN_DIMENSION_OFFSET_MM).toBeGreaterThan(0);
  });

  it('инженерия приходит с цветом и подписью', () => {
    const service: ServicePoint = {
      id: randomUUID(),
      kind: 'water',
      position: { x: 100, y: 200 },
      heightMm: 500,
      wallId: null,
      note: '',
    };

    const plan = planGeometry(doc({ services: [service] }), catalog);
    expect(plan.services[0]?.name).toBe('Вода');
    expect(plan.services[0]?.colour).toMatch(/^#/);
  });

  it('габарит плана охватывает и мебель, и размеры', () => {
    const plan = planGeometry(doc({ placements: [place('BASE')] as never }), catalog);
    expect(plan.bounds!.maxX - plan.bounds!.minX).toBeGreaterThan(4100);
  });
});
