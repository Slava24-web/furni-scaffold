import { describe, expect, it } from 'vitest';
import { drawerZone, hasDrawers } from './drawerZone';
import { boxesOverlap, findConflicts, placementBox, type Box } from './collision';
import type { Placement } from './schema';

const spec = { widthMm: 600, depthMm: 560, heightMm: 820, drawerCount: 3, drawerTravelMm: 360 };

const at = (x: number, z: number, rotationY = 0): Pick<Placement, 'position' | 'rotationY'> => ({
  position: { x, y: 0, z },
  rotationY,
});

describe('зона выдвижения ящиков', () => {
  it('изделие без ящиков зоны не даёт', () => {
    expect(hasDrawers({ drawerCount: 0, drawerTravelMm: 360 })).toBe(false);
    expect(drawerZone(at(0, 0), { ...spec, drawerCount: 0 })).toBeNull();
  });

  it('изделие с ящиками, но без записанного хода, зоны не даёт', () => {
    expect(drawerZone(at(0, 0), { ...spec, drawerTravelMm: 0 })).toBeNull();
  });

  it('зона лежит перед фасадом на длину хода', () => {
    const zone = drawerZone(at(0, 0), spec)!;
    expect(zone.centre.x).toBeCloseTo(0, 3);
    expect(zone.centre.y).toBeCloseTo(560 / 2 + 360 / 2, 3);
    expect(zone.halfDepthMm).toBe(180);
  });

  it('зона не залезает внутрь самого изделия', () => {
    const zone = drawerZone(at(0, 0), spec)!;
    const body = placementBox(at(0, 0), spec);
    expect(boxesOverlap(body, zone)).toBe(false);
  });

  it('зона поворачивается вместе с изделием', () => {
    const zone = drawerZone(at(0, 0, 90), spec)!;
    // Фасад смотрит вдоль +X после поворота на 90°
    expect(zone.centre.x).toBeCloseTo(560 / 2 + 360 / 2, 3);
    expect(zone.centre.y).toBeCloseTo(0, 3);
  });

  it('высота зоны совпадает с высотой изделия', () => {
    const zone = drawerZone({ position: { x: 0, y: 100, z: 0 }, rotationY: 0 }, spec)!;
    expect(zone.bottomMm).toBe(100);
    expect(zone.topMm).toBe(920);
  });
});

describe('конфликты с зоной выдвижения', () => {
  const subject: Box = {
    centre: { x: 0, y: 500 },
    halfWidthMm: 300,
    halfDepthMm: 300,
    rotationDeg: 0,
    bottomMm: 0,
    topMm: 800,
  };

  it('объект перед фасадом соседа мешает его ящикам', () => {
    const neighbour = { instanceId: 'n1', box: drawerZone(at(0, 0), spec)! };
    const report = findConflicts(subject, [], [], undefined, [], { neighbours: [neighbour] });

    expect(report.blockedDrawerIds).toEqual(['n1']);
  });

  it('объект в стороне ящикам соседа не мешает', () => {
    const neighbour = { instanceId: 'n1', box: drawerZone(at(4000, 0), spec)! };
    const report = findConflicts(subject, [], [], undefined, [], { neighbours: [neighbour] });

    expect(report.blockedDrawerIds).toEqual([]);
  });

  it('своим ящикам мешает объект, стоящий перед фасадом', () => {
    const own = drawerZone(at(0, 0), spec)!;
    const blocker = {
      id: 'other',
      box: { ...subject, centre: { x: 0, y: 460 } },
    };
    const report = findConflicts(subject, [blocker], [], undefined, [], { own });

    expect(report.ownDrawersBlocked).toBe(true);
  });

  it('пустая зона выдвижения конфликта не даёт', () => {
    const report = findConflicts(subject, [], [], undefined, [], { own: null });
    expect(report.ownDrawersBlocked).toBe(false);
  });

  it('без контекста ящиков отчёт остаётся прежним', () => {
    const report = findConflicts(subject, [], []);
    expect(report.blockedDrawerIds).toEqual([]);
    expect(report.ownDrawersBlocked).toBe(false);
  });
});
