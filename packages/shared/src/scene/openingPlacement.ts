import { projectOntoWall, wallLengthMm, type Vec2 } from './walls';
import type { Room, Wall } from './schema';

/**
 * Куда встанет дверь или окно по указанной точке.
 *
 * Пользователь целится в стену, а не задаёт её идентификатор и смещение.
 * Расчёт вынесен отдельно, потому что им пользуются двое: подсветка
 * будущего места и сама вставка проёма. Считай их по-разному — проём
 * встанет не туда, куда показывала подсветка.
 */

export interface OpeningPlan {
  wall: Wall;
  /** Смещение начала проёма вдоль стены от её start */
  offsetMm: number;
  widthMm: number;
  /** Насколько точка прицела далека от стены */
  distanceMm: number;
}

export function planOpening(room: Room, point: Vec2, widthMm: number): OpeningPlan | null {
  let best: OpeningPlan | null = null;

  for (const wall of room.walls) {
    const projection = projectOntoWall(wall, point);
    if (best && projection.distanceMm >= best.distanceMm) continue;

    // Проём центрируется по точке и прижимается к торцам стены: иначе
    // дверь вылезает за край и молча исчезает из геометрии
    const length = wallLengthMm(wall);
    const width = Math.min(widthMm, Math.round(length));
    const maxOffset = Math.max(0, Math.round(length - width));

    best = {
      wall,
      offsetMm: Math.round(Math.min(maxOffset, Math.max(0, projection.offsetMm - width / 2))),
      widthMm: width,
      distanceMm: projection.distanceMm,
    };
  }

  return best;
}
