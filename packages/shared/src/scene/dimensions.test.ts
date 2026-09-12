import { describe, expect, it } from 'vitest';
import {
  MAX_ROOM_SIDE_MM,
  MIN_ROOM_SIDE_MM,
  rectangularExtent,
  resizeRoomWall,
  roomDimensions,
  wallAxis,
  wallDimension,
} from './dimensions';
import { createRectangularRoom, wallLengthMm } from './walls';
import { randomUUID } from './uuid';
import type { Opening, Room } from './schema';

const room = (): Room => createRectangularRoom({ widthMm: 4000, depthMm: 3200 });

/** Стена, идущая вдоль X: по ней в прямоугольной комнате читается ширина. */
function widthWall(value: Room): string {
  return roomDimensions(value).find((d) => d.axis === 'x')!.wallId;
}

function depthWall(value: Room): string {
  return roomDimensions(value).find((d) => d.axis === 'z')!.wallId;
}

describe('ось стены', () => {
  it('различает стены вдоль X и вдоль Z', () => {
    expect(wallAxis({ start: { x: 0, y: 0 }, end: { x: 1000, y: 0 } })).toBe('x');
    expect(wallAxis({ start: { x: 0, y: 0 }, end: { x: 0, y: 1000 } })).toBe('z');
  });

  it('наклонная стена оси не имеет', () => {
    expect(wallAxis({ start: { x: 0, y: 0 }, end: { x: 1000, y: 1000 } })).toBeNull();
  });
});

describe('габариты прямоугольного помещения', () => {
  it('считаются по осевым линиям', () => {
    const extent = rectangularExtent(room())!;
    // Осевой размер больше размера в свету на толщину стены
    expect(extent.maxX - extent.minX).toBe(4100);
    expect(extent.maxZ - extent.minZ).toBe(3300);
  });

  it('незамкнутый контур прямоугольником не считается', () => {
    const value = room();
    const walls = value.walls.map((wall, index) =>
      index === 0 ? { ...wall, end: { x: wall.end.x + 500, y: wall.end.y } } : wall,
    );
    expect(rectangularExtent({ walls })).toBeNull();
  });

  it('контур из трёх стен прямоугольником не считается', () => {
    expect(rectangularExtent({ walls: room().walls.slice(0, 3) })).toBeNull();
  });
});

describe('размерные линии', () => {
  it('подписывают размер в свету, а не осевой', () => {
    const dimensions = roomDimensions(room());
    const lengths = dimensions.map((d) => d.clearLengthMm).sort((a, b) => a - b);
    expect(lengths).toEqual([3200, 3200, 4000, 4000]);
  });

  it('длина линии совпадает с подписанным размером', () => {
    for (const dimension of roomDimensions(room())) {
      const length = Math.hypot(
        dimension.end.x - dimension.start.x,
        dimension.end.y - dimension.start.y,
      );
      expect(Math.round(length)).toBe(dimension.clearLengthMm);
    }
  });

  it('линия отодвинута внутрь помещения', () => {
    // Центр комнаты в нуле: линия обязана оказаться ближе к нему, чем стена
    for (const dimension of roomDimensions(room())) {
      expect(Math.hypot(dimension.labelAt.x, dimension.labelAt.y)).toBeLessThan(
        Math.max(4100, 3300) / 2,
      );
    }
  });

  it('правятся только размеры прямоугольного помещения', () => {
    const skewed: Room = {
      ...room(),
      walls: room().walls.map((wall, index) =>
        index === 0 ? { ...wall, end: { x: wall.end.x, y: wall.end.y + 700 } } : wall,
      ),
    };
    expect(roomDimensions(skewed).every((d) => !d.editable)).toBe(true);
  });
});

describe('ввод размера помещения', () => {
  it('меняет размер в свету на введённый', () => {
    const source = room();
    const id = widthWall(source);
    const next = resizeRoomWall(source, id, 5000);
    expect(wallDimension(next, id)!.clearLengthMm).toBe(5000);
  });

  it('не трогает перпендикулярный размер', () => {
    const source = room();
    const id = depthWall(source);
    const next = resizeRoomWall(source, widthWall(source), 5000);
    expect(wallDimension(next, id)!.clearLengthMm).toBe(3200);
  });

  it('оставляет на месте сторону с меньшей координатой', () => {
    const source = room();
    const before = rectangularExtent(source)!;
    const next = resizeRoomWall(source, widthWall(source), 5000);
    const after = rectangularExtent(next)!;
    expect(after.minX).toBe(before.minX);
    expect(after.maxX).toBe(before.maxX + 1000);
  });

  it('контур остаётся прямоугольным', () => {
    const source = room();
    const next = resizeRoomWall(source, depthWall(source), 6000);
    expect(rectangularExtent(next)).not.toBeNull();
  });

  it('отвергает размеры вне допустимых пределов', () => {
    const source = room();
    const id = widthWall(source);
    expect(resizeRoomWall(source, id, MIN_ROOM_SIDE_MM - 1)).toBe(source);
    expect(resizeRoomWall(source, id, MAX_ROOM_SIDE_MM + 1)).toBe(source);
    expect(resizeRoomWall(source, id, Number.NaN)).toBe(source);
  });

  it('неизвестная стена ничего не меняет', () => {
    const source = room();
    expect(resizeRoomWall(source, randomUUID(), 5000)).toBe(source);
  });

  it('прижимает проём, оказавшийся за торцом укороченной стены', () => {
    const source = room();
    const wallId = widthWall(source);
    const opening: Opening = {
      id: randomUUID(),
      wallId,
      kind: 'door',
      offset: 3000,
      width: 900,
      height: 2100,
      sillHeight: 0,
      swingRadius: null,
    };
    const next = resizeRoomWall({ ...source, openings: [opening] }, wallId, 1000);
    const wall = next.walls.find((w) => w.id === wallId)!;
    const moved = next.openings[0]!;

    expect(moved.offset + moved.width).toBeLessThanOrEqual(Math.round(wallLengthMm(wall)));
  });
});
