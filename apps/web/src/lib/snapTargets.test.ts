import { describe, expect, it } from 'vitest';
import { createRectangularRoom, type Box } from '@furni/shared';
import { chainSnapTargets, snapTargets, wallSnapTargets } from './snapTargets';

const room = createRectangularRoom({ widthMm: 4000, depthMm: 3000 });

const box = (x: number, z: number, halfWidthMm = 300): Box => ({
  centre: { x, y: z },
  halfWidthMm,
  halfDepthMm: 300,
  rotationDeg: 0,
  bottomMm: 0,
  topMm: 820,
});

describe('wallSnapTargets', () => {
  it('даёт по цели на каждую стену', () => {
    const targets = wallSnapTargets([room]);
    expect(targets).toHaveLength(room.walls.length);
    expect(targets.every((t) => t.kind === 'wall')).toBe(true);
  });

  it('нормаль смотрит внутрь помещения', () => {
    // Цель у нижней стены: объект прижимается к ней изнутри, поэтому
    // нормаль обязана указывать в сторону центра комнаты
    for (const target of wallSnapTargets([room])) {
      if (target.kind !== 'wall') continue;
      const midX = (target.a.x + target.b.x) / 2;
      const midY = (target.a.y + target.b.y) / 2;
      // Комната построена вокруг начала координат
      const toCentre = { x: -midX, y: -midY };
      expect(target.normal.x * toCentre.x + target.normal.y * toCentre.y).toBeGreaterThan(0);
    }
  });
});

describe('chainSnapTargets', () => {
  it('соседние модули склеиваются в один фронт', () => {
    // Две тумбы по 600 стоят вплотную: столешницу выравнивают по краю
    // ряда, а не по краю случайной тумбы внутри него
    const targets = chainSnapTargets([
      { id: 'a', box: box(0, 0) },
      { id: 'b', box: box(600, 0) },
    ]);

    expect(targets).toHaveLength(1);
    const target = targets[0];
    if (target?.kind !== 'object') throw new Error('ожидалась цель-объект');
    expect(target.footprint?.halfWidthMm).toBe(600);
    expect(target.position.x).toBe(300);
  });

  it('разнесённые модули остаются отдельными целями', () => {
    const targets = chainSnapTargets([
      { id: 'a', box: box(0, 0) },
      { id: 'b', box: box(3000, 0) },
    ]);
    expect(targets).toHaveLength(2);
  });

  it('высоты переносятся в цель: по ним решается стыковка или укладка сверху', () => {
    const targets = chainSnapTargets([{ id: 'a', box: box(0, 0) }]);
    const target = targets[0];
    if (target?.kind !== 'object') throw new Error('ожидалась цель-объект');
    expect(target.footprint?.bottomMm).toBe(0);
    expect(target.footprint?.topMm).toBe(820);
  });
});

describe('snapTargets', () => {
  it('объединяет стены и соседей', () => {
    const targets = snapTargets([room], [{ id: 'a', box: box(0, 0) }]);
    expect(targets).toHaveLength(room.walls.length + 1);
  });
});
