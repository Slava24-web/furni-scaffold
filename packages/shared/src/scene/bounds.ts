import { rectangularExtent } from './dimensions';
import type { Room } from './schema';
import type { Vec2 } from './walls';

/**
 * Ограничение перемещения габаритами помещения.
 *
 * Без него объект уезжает за стену и теряется: указатель ловит пол за
 * пределами комнаты, шкаф улетает туда, и вернуть его можно только
 * отменой. Стены — это и есть край рабочей области, а не декорация.
 *
 * Ограничение мягкое: оно не запрещает движение, а прижимает объект к
 * границе. Заблокированное перетаскивание ощущается как поломка
 * (та же причина, по которой не блокируются конфликты).
 */

export interface FootprintMm {
  halfWidthMm: number;
  halfDepthMm: number;
  rotationDeg: number;
}

export interface RoomBoundsMm {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Прямоугольник, внутри которого разрешено ставить объекты.
 *
 * Для прямоугольного помещения это в точности внутренние поверхности
 * стен. Для контура, нарисованного вручную, берётся его габаритный
 * прямоугольник: он ЗАВЕДОМО не меньше самой комнаты, поэтому ни одна
 * законная позиция не запрещается. Вынос в вырез Г-образной комнаты
 * ловит проверка конфликтов — она считает контур честно.
 */
export function roomBounds(rooms: readonly Room[]): RoomBoundsMm | null {
  const walls = rooms.flatMap((room) => room.walls);
  if (walls.length === 0) return null;

  const [room] = rooms;
  const extent = room && rooms.length === 1 ? rectangularExtent(room) : null;
  const thickness = Math.max(...walls.map((wall) => wall.thickness)) / 2;

  if (extent) {
    return {
      minX: extent.minX + thickness,
      maxX: extent.maxX - thickness,
      minZ: extent.minZ + thickness,
      maxZ: extent.maxZ - thickness,
    };
  }

  const xs = walls.flatMap((wall) => [wall.start.x, wall.end.x]);
  const zs = walls.flatMap((wall) => [wall.start.y, wall.end.y]);
  return {
    minX: Math.min(...xs) + thickness,
    maxX: Math.max(...xs) - thickness,
    minZ: Math.min(...zs) + thickness,
    maxZ: Math.max(...zs) - thickness,
  };
}

/**
 * Габарит повёрнутого объекта по мировым осям.
 *
 * Повёрнутый на 45° шкаф занимает по осям больше, чем его ширина: без
 * пересчёта он углом уходил бы в стену.
 */
export function worldHalfExtents(footprint: FootprintMm): { x: number; z: number } {
  const angle = (footprint.rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));

  return {
    x: footprint.halfWidthMm * cos + footprint.halfDepthMm * sin,
    z: footprint.halfWidthMm * sin + footprint.halfDepthMm * cos,
  };
}

/**
 * Позиция, прижатая к границам помещения.
 *
 * Объект крупнее комнаты ставится по центру: прижимать его некуда, а
 * рывок в угол выглядел бы сбоем.
 */
export function clampToRoom(
  position: Vec2,
  footprint: FootprintMm,
  bounds: RoomBoundsMm | null,
): Vec2 {
  if (!bounds) return position;

  const half = worldHalfExtents(footprint);
  return {
    x: clampAxis(position.x, bounds.minX + half.x, bounds.maxX - half.x),
    y: clampAxis(position.y, bounds.minZ + half.z, bounds.maxZ - half.z),
  };
}

function clampAxis(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}
