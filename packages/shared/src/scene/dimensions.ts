import type { Opening, Room, Wall } from './schema';
import { innerNormal, pointAlongWall, wallLengthMm, type Vec2 } from './walls';

/**
 * Размерные линии помещения и правка размеров вводом числа.
 *
 * Чистая математика на миллиметрах: ни Three.js, ни DOM. Вьюер рисует
 * по этим данным, страница по ним же правит документ — расхождения между
 * подписанным размером и тем, что получится после ввода, невозможны.
 *
 * Размер показывается В СВЕТУ, а не по осевым линиям: заказчик меряет
 * комнату рулеткой между поверхностями стен, и подпись обязана совпадать
 * с этим замером.
 */

/** Отступ размерной линии от внутренней поверхности стены. */
export const DIMENSION_OFFSET_MM = 300;

/** Пределы ввода размера: за ними помещение перестаёт быть помещением. */
export const MIN_ROOM_SIDE_MM = 500;
export const MAX_ROOM_SIDE_MM = 30000;

/** Допуск на совпадение углов и на выравнивание стены по оси. */
const TOLERANCE_MM = 1;

/** Что правит подпись: сторону помещения или ширину проёма. */
export type DimensionTarget =
  | { kind: 'wall'; wallId: string }
  | { kind: 'opening'; openingId: string };

export interface WallDimension {
  /** Ключ подписи: по нему вьюер отдаёт обратно то, во что попал луч */
  id: string;
  target: DimensionTarget;
  wallId: string;
  /** Длина по осевой линии */
  axisLengthMm: number;
  /** Длина в свету: осевая минус половины толщин соседних стен */
  clearLengthMm: number;
  /** Концы выносной линии в плане (x, z) */
  start: Vec2;
  end: Vec2;
  /** Середина линии — место подписи */
  labelAt: Vec2;
  /** Ось, вдоль которой идёт стена; null для наклонной */
  axis: 'x' | 'z' | null;
  /** Можно ли ввести размер: только для прямоугольного помещения */
  editable: boolean;
}

/** Габариты прямоугольного помещения по осевым линиям стен. */
export interface RoomExtent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function samePoint(a: Vec2, b: Vec2): boolean {
  return Math.abs(a.x - b.x) <= TOLERANCE_MM && Math.abs(a.y - b.y) <= TOLERANCE_MM;
}

/** Ось стены. null — стена идёт наискось, размер по ней не правится. */
export function wallAxis(wall: Pick<Wall, 'start' | 'end'>): 'x' | 'z' | null {
  const dx = Math.abs(wall.end.x - wall.start.x);
  const dz = Math.abs(wall.end.y - wall.start.y);
  if (dz <= TOLERANCE_MM && dx > TOLERANCE_MM) return 'x';
  if (dx <= TOLERANCE_MM && dz > TOLERANCE_MM) return 'z';
  return null;
}

/**
 * Габариты помещения, если его контур — прямоугольник по осям.
 *
 * Ввод размера меняет сразу две стены (сторона помещения уезжает целиком),
 * и корректно это определено только для прямоугольника. Для контура,
 * нарисованного вручную, размеры показываются, но не правятся: сдвиг
 * одной вершины произвольного контура оставил бы стены разорванными.
 */
export function rectangularExtent(room: Pick<Room, 'walls'>): RoomExtent | null {
  const { walls } = room;
  if (walls.length !== 4) return null;

  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i]!;
    const next = walls[(i + 1) % walls.length]!;
    if (wallAxis(wall) === null) return null;
    if (!samePoint(wall.end, next.start)) return null;
    // Соседние стены прямоугольника всегда перпендикулярны
    if (wallAxis(wall) === wallAxis(next)) return null;
  }

  const xs = walls.map((wall) => wall.start.x);
  const zs = walls.map((wall) => wall.start.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

/** Стена, которая заканчивается там, где начинается заданная. */
function previousWall(walls: readonly Wall[], wall: Wall): Wall | undefined {
  return walls.find((other) => other.id !== wall.id && samePoint(other.end, wall.start));
}

/** Стена, которая начинается там, где заканчивается заданная. */
function nextWall(walls: readonly Wall[], wall: Wall): Wall | undefined {
  return walls.find((other) => other.id !== wall.id && samePoint(other.start, wall.end));
}

/**
 * Размерные линии всех стен помещения.
 *
 * Линия лежит внутри комнаты, параллельно стене, и тянется от одной
 * внутренней поверхности до другой — ровно на ту длину, которая написана
 * в подписи.
 */
export function roomDimensions(room: Room, offsetMm = DIMENSION_OFFSET_MM): WallDimension[] {
  const extent = rectangularExtent(room);

  return room.walls.map((wall) => {
    const axisLengthMm = wallLengthMm(wall);
    const halfStart = (previousWall(room.walls, wall)?.thickness ?? 0) / 2;
    const halfEnd = (nextWall(room.walls, wall)?.thickness ?? 0) / 2;
    const clearLengthMm = Math.max(0, Math.round(axisLengthMm - halfStart - halfEnd));

    const normal = innerNormal(room, wall);
    const shift = wall.thickness / 2 + offsetMm;
    const offsetPoint = (alongMm: number): Vec2 => {
      const base = pointAlongWall(wall, alongMm);
      return { x: base.x + normal.x * shift, y: base.y + normal.y * shift };
    };

    const start = offsetPoint(halfStart);
    const end = offsetPoint(Math.max(halfStart, axisLengthMm - halfEnd));
    const axis = wallAxis(wall);

    return {
      id: `wall:${wall.id}`,
      target: { kind: 'wall', wallId: wall.id },
      wallId: wall.id,
      axisLengthMm,
      clearLengthMm,
      start,
      end,
      labelAt: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      axis,
      editable: extent !== null && axis !== null,
    };
  });
}

/** Размерная линия одной стены — для подстановки текущего значения в поле ввода. */
export function wallDimension(room: Room, wallId: string): WallDimension | undefined {
  return roomDimensions(room).find((dimension) => dimension.wallId === wallId);
}

/**
 * Новое помещение с заданным размером в свету по указанной стене.
 *
 * Двигается сторона с бОльшей координатой, противоположная остаётся на
 * месте. Правило намеренно не зависит от направления обхода контура:
 * иначе ввод ширины по нижней стене растягивал бы комнату вправо, а по
 * верхней — влево, и пользователь не мог бы предсказать результат.
 *
 * Возвращает исходное помещение, если правка невозможна: контур не
 * прямоугольный, стены нет или размер вне допустимых пределов.
 */
export function resizeRoomWall(room: Room, wallId: string, clearLengthMm: number): Room {
  const wall = room.walls.find((candidate) => candidate.id === wallId);
  const extent = rectangularExtent(room);
  if (!wall || !extent) return room;

  const axis = wallAxis(wall);
  if (axis === null) return room;

  const target = Math.round(clearLengthMm);
  if (!Number.isFinite(target) || target < MIN_ROOM_SIDE_MM || target > MAX_ROOM_SIDE_MM) {
    return room;
  }

  const halfStart = (previousWall(room.walls, wall)?.thickness ?? 0) / 2;
  const halfEnd = (nextWall(room.walls, wall)?.thickness ?? 0) / 2;
  const currentSpan = axis === 'x' ? extent.maxX - extent.minX : extent.maxZ - extent.minZ;
  const delta = Math.round(target + halfStart + halfEnd - currentSpan);
  if (delta === 0) return room;

  const maxCoord = axis === 'x' ? extent.maxX : extent.maxZ;
  const move = (point: Vec2): Vec2 => {
    const coord = axis === 'x' ? point.x : point.y;
    if (Math.abs(coord - maxCoord) > TOLERANCE_MM) return point;
    return axis === 'x' ? { x: point.x + delta, y: point.y } : { x: point.x, y: point.y + delta };
  };

  const walls = room.walls.map((candidate) => ({
    ...candidate,
    start: move(candidate.start),
    end: move(candidate.end),
  }));

  return { ...room, walls, openings: clampOpenings(walls, room.openings) };
}

/**
 * Прижатие проёмов к укоротившимся стенам.
 *
 * Без этого дверь, оказавшаяся за торцом стены, просто исчезает из
 * геометрии: разбиение на панели отбрасывает проёмы вне стены.
 */
function clampOpenings(walls: readonly Wall[], openings: readonly Opening[]): Opening[] {
  return openings.map((opening) => {
    const wall = walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) return opening;

    const maxOffset = Math.max(0, Math.round(wallLengthMm(wall) - opening.width));
    const offset = Math.min(maxOffset, Math.max(0, opening.offset));
    return offset === opening.offset ? opening : { ...opening, offset };
  });
}

/** Отступ размерной линии проёма: ближе к стене, чем размер помещения. */
export const OPENING_DIMENSION_OFFSET_MM = 90;

/** Пределы ширины проёма. */
export const MIN_OPENING_WIDTH_MM = 300;

/**
 * Размерные линии проёмов.
 *
 * Ширина двери и окна — такой же вводимый размер, как сторона комнаты:
 * на глаз проём не поставить, а стандартные полотна идут фиксированным
 * рядом. Линия лежит перед проёмом, ближе к стене, чем размер помещения,
 * чтобы подписи не наезжали друг на друга.
 */
export function openingDimensions(
  room: Room,
  offsetMm = OPENING_DIMENSION_OFFSET_MM,
): WallDimension[] {
  const dimensions: WallDimension[] = [];

  for (const opening of room.openings) {
    const wall = room.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) continue;

    const length = wallLengthMm(wall);
    const from = Math.max(0, Math.min(length, opening.offset));
    const to = Math.max(0, Math.min(length, opening.offset + opening.width));
    if (to <= from) continue;

    const normal = innerNormal(room, wall);
    const shift = wall.thickness / 2 + offsetMm;
    const at = (alongMm: number): Vec2 => {
      const base = pointAlongWall(wall, alongMm);
      return { x: base.x + normal.x * shift, y: base.y + normal.y * shift };
    };

    const start = at(from);
    const end = at(to);
    dimensions.push({
      id: `opening:${opening.id}`,
      target: { kind: 'opening', openingId: opening.id },
      wallId: wall.id,
      axisLengthMm: to - from,
      clearLengthMm: Math.round(to - from),
      start,
      end,
      labelAt: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      axis: wallAxis(wall),
      editable: true,
    });
  }

  return dimensions;
}

/** Все размерные линии плана: стороны помещения и ширины проёмов. */
export function planDimensions(room: Room): WallDimension[] {
  return [...roomDimensions(room), ...openingDimensions(room)];
}

/**
 * Новое помещение с изменённой шириной проёма.
 *
 * Проём растягивается от своего начала и упирается в торец стены:
 * вылезший за него проём молча исчезает из геометрии, потому что
 * разбиение на панели отбрасывает проёмы вне стены.
 */
export function resizeOpening(room: Room, openingId: string, widthMm: number): Room {
  const opening = room.openings.find((candidate) => candidate.id === openingId);
  const wall = room.walls.find((candidate) => candidate.id === opening?.wallId);
  if (!opening || !wall) return room;

  const target = Math.round(widthMm);
  if (!Number.isFinite(target) || target < MIN_OPENING_WIDTH_MM) return room;

  const length = Math.round(wallLengthMm(wall));
  const width = Math.min(target, length);
  const offset = Math.min(opening.offset, Math.max(0, length - width));
  if (width === opening.width && offset === opening.offset) return room;

  return {
    ...room,
    openings: room.openings.map((candidate) =>
      candidate.id === openingId ? { ...candidate, width, offset } : candidate,
    ),
  };
}
