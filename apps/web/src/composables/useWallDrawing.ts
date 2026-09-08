import { computed, ref, shallowRef } from 'vue';
import { randomUUID, type Wall } from '@furni/shared';

export interface DrawPoint {
  x: number;
  z: number;
}

const GRID_STEP_MM = 50;
/** Радиус, в котором клик считается попаданием в первую точку контура. */
const CLOSE_RADIUS_MM = 300;

/**
 * Рисование стен последовательностью точек.
 *
 * Стена создаётся сразу на второй точке и на каждой следующей: контур
 * растёт на глазах, а не появляется целиком в конце. Без промежуточной
 * обратной связи пользователь не понимает, куда попал клик.
 */
export function useWallDrawing(options: {
  onWall: (wall: Wall) => void;
  thicknessMm?: number;
  heightMm?: number;
}) {
  const points = shallowRef<DrawPoint[]>([]);
  const active = ref(false);

  const canFinish = computed(() => points.value.length >= 2);

  function snapToGrid(value: number): number {
    return Math.round(value / GRID_STEP_MM) * GRID_STEP_MM;
  }

  function start(): void {
    points.value = [];
    active.value = true;
  }

  /**
   * Добавляет точку контура. Возвращает true, если контур замкнулся
   * и рисование завершено.
   */
  function addPoint(raw: DrawPoint): boolean {
    if (!active.value) return false;

    const point: DrawPoint = { x: snapToGrid(raw.x), z: snapToGrid(raw.z) };
    const first = points.value[0];
    const previous = points.value.at(-1);

    // Клик по первой точке замыкает контур
    const closing =
      first !== undefined &&
      points.value.length >= 2 &&
      Math.hypot(point.x - first.x, point.z - first.z) <= CLOSE_RADIUS_MM;

    const target = closing ? first : point;

    if (previous && (previous.x !== target.x || previous.z !== target.z)) {
      options.onWall(makeWall(previous, target, options));
    }

    if (closing) {
      finish();
      return true;
    }

    points.value = [...points.value, target];
    return false;
  }

  function finish(): void {
    active.value = false;
    points.value = [];
  }

  return { points, active, canFinish, start, addPoint, finish };
}

function makeWall(
  from: DrawPoint,
  to: DrawPoint,
  options: { thicknessMm?: number; heightMm?: number },
): Wall {
  return {
    id: randomUUID(),
    start: { x: from.x, y: from.z },
    end: { x: to.x, y: to.z },
    thickness: options.thicknessMm ?? 100,
    height: options.heightMm ?? 2700,
    materialId: null,
  };
}
