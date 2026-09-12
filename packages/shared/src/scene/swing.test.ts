import { describe, expect, it } from 'vitest';
import {
  blockedSwings,
  insideSwing,
  swingArc,
  swingZone,
  swingZones,
  type SwingZone,
} from './swing';
import { createRectangularRoom } from './walls';
import { randomUUID } from './uuid';
import type { Box } from './collision';
import type { Opening, Room } from './schema';

const room = (): Room => createRectangularRoom({ widthMm: 4000, depthMm: 3200 });

function door(value: Room, over: Partial<Opening> = {}): Opening {
  return {
    id: randomUUID(),
    wallId: value.walls[0]!.id,
    kind: 'door',
    offset: 1000,
    width: 900,
    height: 2100,
    sillHeight: 0,
    swingRadius: null,
    hinge: 'left',
    swingInward: true,
    sku: null,
    options: {},
    ...over,
  };
}

/** Габарит в плане: центр в мм, без поворота. */
function box(x: number, z: number, over: Partial<Box> = {}): Box {
  return {
    centre: { x, y: z },
    halfWidthMm: 300,
    halfDepthMm: 300,
    rotationDeg: 0,
    bottomMm: 0,
    topMm: 850,
    ...over,
  };
}

describe('зона открывания', () => {
  it('у окна её нет: выметать нечего', () => {
    const value = room();
    expect(swingZone(value, door(value, { kind: 'window' }))).toBeNull();
  });

  it('радиус по умолчанию равен ширине полотна', () => {
    const value = room();
    expect(swingZone(value, door(value))?.radiusMm).toBe(900);
  });

  it('явный радиус перекрывает ширину', () => {
    const value = room();
    expect(swingZone(value, door(value, { swingRadius: 600 }))?.radiusMm).toBe(600);
  });

  it('нулевой радиус отключает зону', () => {
    const value = room();
    expect(swingZone(value, door(value, { swingRadius: 0 }))).toBeNull();
  });

  it('проём на несуществующей стене зоны не даёт', () => {
    const value = room();
    expect(swingZone(value, door(value, { wallId: randomUUID() }))).toBeNull();
  });

  it('петли задают точку вращения на нужном откосе', () => {
    const value = room();
    const left = swingZone(value, door(value, { hinge: 'left' }))!;
    const right = swingZone(value, door(value, { hinge: 'right' }))!;
    // Стена идёт вдоль X: откосы различаются координатой X на ширину проёма
    expect(Math.abs(right.hinge.x - left.hinge.x)).toBeCloseTo(900, 3);
  });

  it('дуга идёт ровно на четверть круга', () => {
    const value = room();
    const zone = swingZone(value, door(value))!;
    const arc = swingArc(zone, 4);
    const angle = (point: { x: number; y: number }) =>
      Math.atan2(point.y - zone.hinge.y, point.x - zone.hinge.x);

    const sweep = Math.abs(angle(arc.at(-1)!) - angle(arc[0]!));
    expect(sweep).toBeCloseTo(Math.PI / 2, 4);
  });

  it('все точки дуги удалены от петли на радиус', () => {
    const value = room();
    const zone = swingZone(value, door(value))!;
    for (const point of swingArc(zone)) {
      expect(Math.hypot(point.x - zone.hinge.x, point.y - zone.hinge.y)).toBeCloseTo(900, 3);
    }
  });

  it('дверь распахивается внутрь помещения, а не в стену', () => {
    const value = room();
    const zone = swingZone(value, door(value))!;
    const tip = swingArc(zone).at(-1)!;
    // Центр комнаты в нуле: распахнутое полотно обязано оказаться
    // ближе к нему, чем точка навески
    expect(Math.hypot(tip.x, tip.y)).toBeLessThan(Math.hypot(zone.hinge.x, zone.hinge.y));
  });

  it('наружное открывание разворачивает сектор на другую сторону', () => {
    const value = room();
    const inward = swingZone(value, door(value, { swingInward: true }))!;
    const outward = swingZone(value, door(value, { swingInward: false }))!;
    expect(Math.abs(inward.openAngle - outward.openAngle)).toBeCloseTo(Math.PI, 4);
  });

  it('зоны собираются по всем дверям помещения', () => {
    const value = room();
    const withDoors: Room = {
      ...value,
      openings: [door(value), door(value, { kind: 'window' }), door(value, { offset: 2200 })],
    };
    expect(swingZones(withDoors)).toHaveLength(2);
  });
});

describe('препятствие в зоне открывания', () => {
  const value = room();
  const zone = swingZone(value, door(value))!;
  const inside = swingArc(zone)[6]!;

  it('точка внутри сектора распознаётся', () => {
    expect(insideSwing(zone, { x: zone.hinge.x, y: zone.hinge.y })).toBe(true);
  });

  it('точка за радиусом не считается помехой', () => {
    const far = {
      x: zone.hinge.x + (inside.x - zone.hinge.x) * 3,
      y: zone.hinge.y + (inside.y - zone.hinge.y) * 3,
    };
    expect(insideSwing(zone, far)).toBe(false);
  });

  it('объект в секторе мешает двери', () => {
    expect(blockedSwings([zone], box(inside.x, inside.y))).toEqual([zone.openingId]);
  });

  it('объект в стороне двери не мешает', () => {
    expect(blockedSwings([zone], box(zone.hinge.x, zone.hinge.y + 3000))).toEqual([]);
  });

  it('крупный объект, поглотивший сектор целиком, тоже мешает', () => {
    // Все углы габарита вне сектора, но дверь всё равно упрётся
    const huge = box(zone.hinge.x, zone.hinge.y, { halfWidthMm: 3000, halfDepthMm: 3000 });
    expect(blockedSwings([zone], huge)).toEqual([zone.openingId]);
  });

  it('объект ниже полотна двери не мешает', () => {
    // Проём с высоким подоконником: полотно проходит над тумбой
    const high = swingZone(value, door(value, { sillHeight: 1200, height: 900 }))!;
    expect(blockedSwings([high], box(inside.x, inside.y, { bottomMm: 0, topMm: 850 }))).toEqual([]);
  });

  it('объект в габаритах полотна по высоте мешает', () => {
    const high = swingZone(value, door(value, { sillHeight: 1200, height: 900 }))!;
    const tall = box(inside.x, inside.y, { bottomMm: 0, topMm: 2000 });
    expect(blockedSwings([high], tall)).toEqual([high.openingId]);
  });

  it('пустой список зон конфликтов не даёт', () => {
    const none: SwingZone[] = [];
    expect(blockedSwings(none, box(0, 0))).toEqual([]);
  });
});
