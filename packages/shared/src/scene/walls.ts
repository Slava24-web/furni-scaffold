import { randomUUID } from './uuid';
import type { Opening, Room, Wall } from './schema';

/**
 * Геометрия стен и проёмов.
 *
 * Чистые вычисления на числах: ни Three.js, ни DOM. Один и тот же код
 * работает на клиенте (построение меша, снаппинг) и на сервере (валидация
 * присланного документа сцены), поэтому расхождений быть не может.
 *
 * Все размеры — миллиметры целыми. Стена задаётся отрезком по осевой
 * линии, план лежит в плоскости XZ: Vec2 здесь это (x, z) мира.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export function wallLengthMm(wall: Pick<Wall, 'start' | 'end'>): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}

/** Единичное направление вдоль стены от start к end. */
export function wallDirection(wall: Pick<Wall, 'start' | 'end'>): Vec2 {
  const length = wallLengthMm(wall);
  if (length === 0) return { x: 1, y: 0 };
  return { x: (wall.end.x - wall.start.x) / length, y: (wall.end.y - wall.start.y) / length };
}

/** Угол стены в градусах: 0 — вдоль оси X. */
export function wallAngleDeg(wall: Pick<Wall, 'start' | 'end'>): number {
  return (Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180) / Math.PI;
}

/** Точка на осевой линии стены на расстоянии offsetMm от start. */
export function pointAlongWall(wall: Pick<Wall, 'start' | 'end'>, offsetMm: number): Vec2 {
  const dir = wallDirection(wall);
  return { x: wall.start.x + dir.x * offsetMm, y: wall.start.y + dir.y * offsetMm };
}

export interface WallProjection {
  /** Расстояние вдоль стены от start, обрезанное границами отрезка */
  offsetMm: number;
  /** Кратчайшее расстояние от точки до отрезка */
  distanceMm: number;
  /** Точка на осевой линии */
  point: Vec2;
  /** Со стороны какой полуплоскости лежит точка: +1 слева от направления */
  side: 1 | -1;
}

/**
 * Проекция точки на отрезок стены.
 *
 * Обрезание по границам отрезка обязательно: без него мебель у торца
 * стены притягивалась бы к её продолжению, которого физически нет.
 */
export function projectOntoWall(wall: Pick<Wall, 'start' | 'end'>, point: Vec2): WallProjection {
  const dir = wallDirection(wall);
  const length = wallLengthMm(wall);
  const toPoint = { x: point.x - wall.start.x, y: point.y - wall.start.y };

  const raw = toPoint.x * dir.x + toPoint.y * dir.y;
  const offsetMm = Math.min(length, Math.max(0, raw));
  const projected = pointAlongWall(wall, offsetMm);

  const cross = dir.x * toPoint.y - dir.y * toPoint.x;
  return {
    offsetMm,
    distanceMm: Math.hypot(point.x - projected.x, point.y - projected.y),
    point: projected,
    side: cross >= 0 ? 1 : -1,
  };
}

/** Нормаль слева от направления стены (поворот направления на +90°). */
export function wallNormal(wall: Pick<Wall, 'start' | 'end'>): Vec2 {
  const dir = wallDirection(wall);
  return { x: -dir.y, y: dir.x };
}

/**
 * Панель стены — сплошной кусок кладки между проёмами.
 *
 * Проёмы не вырезаются булевыми операциями: CSG на каждый пересчёт
 * планировки слишком дорог и даёт грязную триангуляцию. Вместо этого
 * стена разбивается на прямоугольные панели — простенки во всю высоту,
 * подоконные части под окнами и перемычки над проёмами.
 */
export interface WallPanel {
  /** Смещение начала панели вдоль стены от start */
  offsetMm: number;
  lengthMm: number;
  /** Низ и верх панели от уровня пола */
  bottomMm: number;
  topMm: number;
}

/**
 * Разбиение стены на панели с учётом проёмов.
 * Проёмы вне стены игнорируются, выходящие за край — обрезаются.
 */
export function computeWallPanels(wall: Wall, openings: readonly Opening[]): WallPanel[] {
  const length = wallLengthMm(wall);
  if (length <= 0) return [];

  const relevant = openings
    .filter((opening) => opening.wallId === wall.id)
    .map((opening) => ({
      from: Math.max(0, Math.min(length, opening.offset)),
      to: Math.max(0, Math.min(length, opening.offset + opening.width)),
      sill: Math.max(0, Math.min(wall.height, opening.sillHeight)),
      head: Math.max(0, Math.min(wall.height, opening.sillHeight + opening.height)),
    }))
    .filter((opening) => opening.to > opening.from)
    .sort((a, b) => a.from - b.from);

  const panels: WallPanel[] = [];
  let cursor = 0;

  for (const opening of relevant) {
    // Проёмы могут перекрываться после правки планировки: тогда простенка
    // между ними нет, а подоконник и перемычка считаются по каждому
    if (opening.from > cursor) {
      panels.push({
        offsetMm: cursor,
        lengthMm: opening.from - cursor,
        bottomMm: 0,
        topMm: wall.height,
      });
    }

    const width = opening.to - Math.max(cursor, opening.from);
    const from = Math.max(cursor, opening.from);

    if (width > 0) {
      if (opening.sill > 0) {
        panels.push({ offsetMm: from, lengthMm: width, bottomMm: 0, topMm: opening.sill });
      }
      if (opening.head < wall.height) {
        panels.push({
          offsetMm: from,
          lengthMm: width,
          bottomMm: opening.head,
          topMm: wall.height,
        });
      }
    }

    cursor = Math.max(cursor, opening.to);
  }

  if (cursor < length) {
    panels.push({
      offsetMm: cursor,
      lengthMm: length - cursor,
      bottomMm: 0,
      topMm: wall.height,
    });
  }

  return panels;
}

/** Площадь контура по формуле шнурования. Знак задаёт обход. */
export function contourSignedArea(points: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

/**
 * Нормаль стены, направленная ВНУТРЬ комнаты.
 *
 * От неё зависит, с какой стороны встанет мебель: ошибка в знаке
 * поставит шкаф снаружи помещения. Определяется по обходу контура,
 * а не по эвристике «ближе к центру» — контур бывает невыпуклым.
 */
export function innerNormal(room: Pick<Room, 'walls'>, wall: Wall): Vec2 {
  const contour = room.walls.map((w) => w.start);
  const normal = wallNormal(wall);
  // При обходе против часовой стрелки (площадь > 0) внутренняя сторона
  // слева от направления, при обходе по часовой — справа
  const sign = contour.length >= 3 && contourSignedArea(contour) < 0 ? -1 : 1;
  return { x: normal.x * sign, y: normal.y * sign };
}

export interface RectangularRoomOptions {
  widthMm: number;
  depthMm: number;
  thicknessMm?: number;
  heightMm?: number;
  name?: string;
  /** Центр комнаты в мировых координатах */
  centerMm?: Vec2;
}

/**
 * Прямоугольная комната по габаритам изнутри.
 *
 * Осевые линии стен разносятся наружу на половину толщины: пользователь
 * задаёт размер помещения в свету, а не по осям — иначе комната
 * получается меньше заказанной на толщину стены.
 */
export function createRectangularRoom(options: RectangularRoomOptions): Room {
  const {
    widthMm,
    depthMm,
    thicknessMm = 100,
    heightMm = 2700,
    name = 'Комната',
    centerMm = { x: 0, y: 0 },
  } = options;

  if (widthMm <= 0 || depthMm <= 0) {
    throw new Error('Размеры комнаты должны быть положительными');
  }

  const halfWidth = Math.round(widthMm / 2 + thicknessMm / 2);
  const halfDepth = Math.round(depthMm / 2 + thicknessMm / 2);

  // Обход против часовой стрелки в плоскости XZ
  const corners: Vec2[] = [
    { x: centerMm.x - halfWidth, y: centerMm.y - halfDepth },
    { x: centerMm.x + halfWidth, y: centerMm.y - halfDepth },
    { x: centerMm.x + halfWidth, y: centerMm.y + halfDepth },
    { x: centerMm.x - halfWidth, y: centerMm.y + halfDepth },
  ];

  return {
    id: randomUUID(),
    name,
    walls: corners.map((corner, index) => ({
      id: randomUUID(),
      start: corner,
      end: corners[(index + 1) % corners.length]!,
      thickness: thicknessMm,
      height: heightMm,
      materialId: null,
    })),
    openings: [],
    floorMaterialId: null,
    ceilingMaterialId: null,
  };
}

/** Замкнут ли контур комнаты: конец каждой стены совпадает с началом следующей. */
export function isClosedContour(walls: readonly Wall[], toleranceMm = 1): boolean {
  if (walls.length < 3) return false;
  return walls.every((wall, index) => {
    const next = walls[(index + 1) % walls.length]!;
    return Math.hypot(wall.end.x - next.start.x, wall.end.y - next.start.y) <= toleranceMm;
  });
}
