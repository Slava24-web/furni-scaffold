import { describe, expect, it } from 'vitest';
import { checkErgonomics } from './ergonomics';
import {
  DISHWASHER_STANDING_MM,
  HOB_LANDING_MAIN_MM,
  SINK_LANDING_MAIN_MM,
  sideClearance,
} from './landing';
import { kitchenItems } from './items';
import { createRectangularRoom } from '../scene/walls';
import { randomUUID } from '../scene/uuid';
import type { CatalogProduct } from '../catalog/schema';
import type { Opening, Placement, Room } from '../scene/schema';

const product = (
  sku: string,
  role: CatalogProduct['role'],
  size = { widthMm: 600, heightMm: 820, depthMm: 560 },
): CatalogProduct => ({ sku, name: sku, role, ...size }) as CatalogProduct;

const catalog = new Map<string, CatalogProduct>([
  ['SINK', product('SINK', 'sink', { widthMm: 500, heightMm: 200, depthMm: 440 })],
  ['HOB', product('HOB', 'hob', { widthMm: 580, heightMm: 50, depthMm: 510 })],
  ['FRIDGE', product('FRIDGE', 'fridge', { widthMm: 600, heightMm: 2000, depthMm: 650 })],
  ['DISH', product('DISH', 'dishwasher')],
  ['BASE', product('BASE', 'base')],
]);

let counter = 0;
const at = (sku: string, x: number, z: number, rotationY = 0): Placement =>
  ({
    instanceId: `${sku}-${counter++}`,
    sku,
    position: { x, y: 0, z },
    rotationY,
    options: {},
    params: {},
  }) as Placement;

/**
 * Комната 4000×3200 с центром в начале координат: осевые линии стен
 * разнесены на полтолщины, поэтому внутренняя грань нижней стены
 * лежит на z = −1600.
 */
const room = (): Room => createRectangularRoom({ widthMm: 4000, depthMm: 3200 });

const codes = (placements: Placement[], rooms: Room[] = []): string[] =>
  checkErgonomics(placements, catalog, rooms).map((finding) => finding.code);

// Ряд вдоль нижней стены: фасады смотрят в комнату (+z), поворот 0
const RUN_Z = -1600 + 280;

describe('мойка и угол', () => {
  it('мойка посреди длинного ряда замечаний не даёт', () => {
    const found = codes([at('SINK', 0, RUN_Z)], [room()]);
    expect(found).not.toContain('sink-in-corner');
    expect(found).not.toContain('sink-landing');
    expect(found).not.toContain('sink-landing-tight');
  });

  it('мойка, вдвинутая в угол, вызывает предупреждение', () => {
    // Левая внутренняя грань на x = −2000, мойка полушириной 250
    const found = codes([at('SINK', -1740, RUN_Z)], [room()]);
    expect(found).toContain('sink-in-corner');
  });

  it('мойка у прямого угла из мебели тоже в углу', () => {
    // Тумба перпендикулярным рядом: её фронт смотрит вдоль +x
    const found = codes(
      [at('SINK', -1000, RUN_Z), at('BASE', -1300, RUN_Z + 560, 90)],
      [],
    );
    expect(found).toContain('sink-in-corner');
  });

  it('отодвинутая от угла мойка предупреждение снимает', () => {
    const found = codes([at('SINK', -1000, RUN_Z)], [room()]);
    expect(found).not.toContain('sink-in-corner');
  });

  it('колонна холодильника обрывает поверхность так же, как стена', () => {
    // Просвет 350 мм: по одной стороне мало, по другой ряд открыт —
    // это угловое исключение NKBA, поэтому заметка, а не предупреждение
    expect(codes([at('SINK', 0, RUN_Z), at('FRIDGE', 900, RUN_Z)], [])).toContain(
      'sink-landing-tight',
    );
  });

  it('мойка, зажатая колоннами с двух сторон, — предупреждение', () => {
    const found = codes(
      [at('SINK', 0, RUN_Z), at('FRIDGE', 900, RUN_Z), at('FRIDGE', -900, RUN_Z)],
      [],
    );
    expect(found).toContain('sink-landing');
  });
});

describe('плита', () => {
  it('плита вплотную к перпендикулярной стене — предупреждение', () => {
    const found = codes([at('HOB', -1680, RUN_Z)], [room()]);
    expect(found).toContain('hob-in-corner');
  });

  it('плита под окном — предупреждение', () => {
    const base = room();
    const wall = base.walls[0]!;
    const window: Opening = {
      id: randomUUID(),
      wallId: wall.id,
      kind: 'window',
      // Стена идёт слева направо: середина её длины — центр комнаты
      offset: 1700,
      width: 900,
      height: 1400,
      sillHeight: 900,
      swingRadius: null,
      hinge: 'left',
      swingInward: true,
      sku: null,
      options: {},
    } as Opening;

    const withWindow: Room = { ...base, openings: [window] };
    expect(codes([at('HOB', 150, RUN_Z)], [withWindow])).toContain('hob-under-window');
  });

  it('плита в стороне от окна замечания не даёт', () => {
    const base = room();
    const wall = base.walls[0]!;
    const window = {
      id: randomUUID(),
      wallId: wall.id,
      kind: 'window',
      offset: 200,
      width: 700,
      height: 1400,
      sillHeight: 900,
      swingRadius: null,
      hinge: 'left',
      swingInward: true,
      sku: null,
      options: {},
    } as Opening;

    const withWindow: Room = { ...base, openings: [window] };
    expect(codes([at('HOB', 1200, RUN_Z)], [withWindow])).not.toContain('hob-under-window');
  });
});

describe('посудомойка', () => {
  it('соседняя тумба в том же ряду месту не мешает', () => {
    const found = codes([at('DISH', 0, RUN_Z), at('BASE', 600, RUN_Z)], []);
    expect(found).not.toContain('dishwasher-standing');
  });

  it('посудомойка в углу оставляет человека без места', () => {
    const found = codes([at('DISH', -1700, RUN_Z)], [room()]);
    expect(found).toContain('dishwasher-standing');
  });
});

describe('sideClearance', () => {
  it('открытый торец ряда ограничением не считается', () => {
    const items = kitchenItems([at('SINK', 0, RUN_Z)], catalog);
    const landing = sideClearance(items[0]!, items, []);
    expect(landing.left).toBe(Number.POSITIVE_INFINITY);
    expect(landing.right).toBe(Number.POSITIVE_INFINITY);
  });

  it('расстояние считается от грани до грани', () => {
    const placements = [at('SINK', 0, RUN_Z), at('FRIDGE', 1000, RUN_Z)];
    const items = kitchenItems(placements, catalog);
    // Полуширины 250 и 300, центры в 1000 -> просвет 450
    const landing = sideClearance(items[0]!, items, []);
    expect(landing.right).toBe(450);
    expect(landing.rightId).toBe(placements[1]!.instanceId);
  });

  it('стена, вдоль которой идёт ряд, поверхность не обрывает', () => {
    const items = kitchenItems([at('SINK', 0, RUN_Z)], catalog);
    const landing = sideClearance(items[0]!, items, room().walls);
    // Ограничивают только торцевые стены, до них далеко
    expect(landing.left).toBeGreaterThan(SINK_LANDING_MAIN_MM);
    expect(landing.right).toBeGreaterThan(HOB_LANDING_MAIN_MM);
    expect(landing.left).toBeLessThan(2000);
  });

  it('перпендикулярный режим видит только угол', () => {
    const placements = [at('DISH', 0, RUN_Z), at('BASE', 600, RUN_Z)];
    const items = kitchenItems(placements, catalog);
    const landing = sideClearance(items[0]!, items, [], { perpendicularOnly: true });
    expect(landing.right).toBe(Number.POSITIVE_INFINITY);
    expect(DISHWASHER_STANDING_MM).toBe(535);
  });
});
