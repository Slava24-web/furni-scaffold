import { describe, expect, it } from 'vitest';
import {
  computeWallPanels,
  contourSignedArea,
  createRectangularRoom,
  innerNormal,
  isClosedContour,
  pointAlongWall,
  projectOntoWall,
  wallAngleDeg,
  wallDirection,
  wallLengthMm,
  wallNormal,
} from './walls';
import type { Opening, Wall } from './schema';

const wall = (over: Partial<Wall> = {}): Wall => ({
  id: '11111111-1111-4111-8111-111111111111',
  start: { x: 0, y: 0 },
  end: { x: 4000, y: 0 },
  thickness: 100,
  height: 2700,
  materialId: null,
  ...over,
});

const opening = (over: Partial<Opening> = {}): Opening => ({
  id: '22222222-2222-4222-8222-222222222222',
  wallId: wall().id,
  kind: 'window',
  offset: 1000,
  width: 1200,
  height: 1400,
  sillHeight: 800,
  swingRadius: null,
  ...over,
});

describe('метрика стены', () => {
  it('длина считается по осевой линии', () => {
    expect(wallLengthMm(wall())).toBe(4000);
    expect(wallLengthMm(wall({ end: { x: 3000, y: 4000 } }))).toBe(5000);
  });

  it('направление единичное', () => {
    const dir = wallDirection(wall({ end: { x: 3000, y: 4000 } }));
    expect(Math.hypot(dir.x, dir.y)).toBeCloseTo(1, 9);
  });

  it('вырожденная стена не делит на ноль', () => {
    const dir = wallDirection(wall({ end: { x: 0, y: 0 } }));
    expect(Number.isFinite(dir.x) && Number.isFinite(dir.y)).toBe(true);
  });

  it('угол ноль вдоль оси X и 90 вдоль оси Z', () => {
    expect(wallAngleDeg(wall())).toBe(0);
    expect(wallAngleDeg(wall({ end: { x: 0, y: 4000 } }))).toBe(90);
  });

  it('нормаль перпендикулярна направлению', () => {
    const w = wall({ end: { x: 3000, y: 4000 } });
    const dir = wallDirection(w);
    const normal = wallNormal(w);
    expect(dir.x * normal.x + dir.y * normal.y).toBeCloseTo(0, 9);
  });

  it('точка вдоль стены отсчитывается от start', () => {
    expect(pointAlongWall(wall(), 1500)).toEqual({ x: 1500, y: 0 });
  });
});

describe('проекция на стену', () => {
  it('даёт смещение и расстояние до осевой линии', () => {
    const result = projectOntoWall(wall(), { x: 1500, y: 700 });
    expect(result.offsetMm).toBe(1500);
    expect(result.distanceMm).toBe(700);
  });

  it('обрезает проекцию границами отрезка', () => {
    // Точка за торцом стены не должна притягиваться к её продолжению
    const beyond = projectOntoWall(wall(), { x: 9000, y: 0 });
    expect(beyond.offsetMm).toBe(4000);
    expect(beyond.distanceMm).toBe(5000);

    const before = projectOntoWall(wall(), { x: -2000, y: 0 });
    expect(before.offsetMm).toBe(0);
  });

  it('различает стороны стены', () => {
    expect(projectOntoWall(wall(), { x: 1000, y: 500 }).side).toBe(1);
    expect(projectOntoWall(wall(), { x: 1000, y: -500 }).side).toBe(-1);
  });
});

describe('панели стены', () => {
  it('без проёмов даёт одну панель во всю стену', () => {
    const panels = computeWallPanels(wall(), []);
    expect(panels).toEqual([{ offsetMm: 0, lengthMm: 4000, bottomMm: 0, topMm: 2700 }]);
  });

  it('окно даёт простенки, подоконник и перемычку', () => {
    const panels = computeWallPanels(wall(), [opening()]);

    expect(panels).toContainEqual({ offsetMm: 0, lengthMm: 1000, bottomMm: 0, topMm: 2700 });
    expect(panels).toContainEqual({ offsetMm: 1000, lengthMm: 1200, bottomMm: 0, topMm: 800 });
    expect(panels).toContainEqual({ offsetMm: 1000, lengthMm: 1200, bottomMm: 2200, topMm: 2700 });
    expect(panels).toContainEqual({ offsetMm: 2200, lengthMm: 1800, bottomMm: 0, topMm: 2700 });
  });

  it('дверь не даёт подоконника', () => {
    const panels = computeWallPanels(
      wall(),
      [opening({ kind: 'door', sillHeight: 0, height: 2100, offset: 1000, width: 900 })],
    );
    const belowDoor = panels.filter((p) => p.offsetMm === 1000 && p.bottomMm === 0);
    expect(belowDoor).toHaveLength(0);
    expect(panels).toContainEqual({ offsetMm: 1000, lengthMm: 900, bottomMm: 2100, topMm: 2700 });
  });

  it('проём во всю высоту не оставляет перемычки', () => {
    const panels = computeWallPanels(
      wall(),
      [opening({ kind: 'arch', sillHeight: 0, height: 2700, offset: 1000, width: 1000 })],
    );
    expect(panels.some((p) => p.offsetMm === 1000)).toBe(false);
    expect(panels).toHaveLength(2);
  });

  it('проём за краем стены обрезается', () => {
    const panels = computeWallPanels(
      wall(),
      [opening({ offset: 3500, width: 2000, sillHeight: 0, height: 2100 })],
    );
    // Ничего не выходит за длину стены
    for (const panel of panels) {
      expect(panel.offsetMm + panel.lengthMm).toBeLessThanOrEqual(4000);
    }
  });

  it('проём другой стены игнорируется', () => {
    const foreign = opening({ wallId: '33333333-3333-4333-8333-333333333333' });
    expect(computeWallPanels(wall(), [foreign])).toHaveLength(1);
  });

  it('перекрывающиеся проёмы не дают панелей отрицательной длины', () => {
    const panels = computeWallPanels(wall(), [
      opening({ offset: 1000, width: 1200 }),
      opening({ id: 'x', offset: 1500, width: 1200 }),
    ]);
    for (const panel of panels) {
      expect(panel.lengthMm).toBeGreaterThan(0);
      expect(panel.topMm).toBeGreaterThan(panel.bottomMm);
    }
  });

  it('вырожденная стена не даёт панелей', () => {
    expect(computeWallPanels(wall({ end: { x: 0, y: 0 } }), [])).toHaveLength(0);
  });
});

describe('прямоугольная комната', () => {
  it('создаёт четыре замкнутые стены', () => {
    const room = createRectangularRoom({ widthMm: 4000, depthMm: 3000 });
    expect(room.walls).toHaveLength(4);
    expect(isClosedContour(room.walls)).toBe(true);
  });

  it('размер в свету соответствует заказанному', () => {
    // Осевые линии разнесены на половину толщины наружу
    const room = createRectangularRoom({ widthMm: 4000, depthMm: 3000, thicknessMm: 200 });
    const xs = room.walls.map((w) => w.start.x);
    const clearWidth = Math.max(...xs) - Math.min(...xs) - 200;
    expect(clearWidth).toBe(4000);
  });

  it('отвергает неположительные размеры', () => {
    expect(() => createRectangularRoom({ widthMm: 0, depthMm: 3000 })).toThrow();
    expect(() => createRectangularRoom({ widthMm: 4000, depthMm: -1 })).toThrow();
  });

  it('стены получают разные идентификаторы', () => {
    const room = createRectangularRoom({ widthMm: 4000, depthMm: 3000 });
    expect(new Set(room.walls.map((w) => w.id)).size).toBe(4);
  });
});

describe('ориентация контура', () => {
  it('знак площади различает обход', () => {
    const ccw = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
    ];
    expect(contourSignedArea(ccw)).toBeGreaterThan(0);
    expect(contourSignedArea([...ccw].reverse())).toBeLessThan(0);
  });

  it('внутренняя нормаль смотрит внутрь комнаты', () => {
    const room = createRectangularRoom({ widthMm: 4000, depthMm: 3000 });
    for (const w of room.walls) {
      const normal = innerNormal(room, w);
      const middle = pointAlongWall(w, wallLengthMm(w) / 2);
      const probe = { x: middle.x + normal.x * 200, y: middle.y + normal.y * 200 };
      // Точка в 200 мм по нормали обязана оказаться внутри габарита комнаты
      expect(Math.abs(probe.x)).toBeLessThan(Math.abs(middle.x) + 1);
      expect(Math.abs(probe.y)).toBeLessThan(Math.abs(middle.y) + 1);
    }
  });
});
