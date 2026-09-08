import { Vector2 } from 'three';

export type ViewMode = 'plan2d' | 'orbit3d';

export type GestureEvent =
  | { type: 'tap'; point: Vector2 }
  | { type: 'doubleTap'; point: Vector2 }
  | { type: 'longPress'; point: Vector2 }
  | { type: 'dragStart'; point: Vector2; onSelection: boolean }
  | { type: 'dragMove'; point: Vector2; delta: Vector2; onSelection: boolean }
  | { type: 'dragEnd'; point: Vector2; onSelection: boolean }
  | { type: 'pinch'; scale: number; center: Vector2 }
  | { type: 'twoFingerPan'; delta: Vector2 }
  | { type: 'twoFingerRotate'; angle: number };

const TAP_MAX_MS = 250;
const TAP_MAX_MOVE_PX = 10;
const LONG_PRESS_MS = 500;
const DOUBLE_TAP_MAX_MS = 300;

/**
 * Разбор указательных событий в жесты по карте из ТЗ 8.1.
 *
 * Ключевое правило: прямое перетаскивание объекта разрешено ТОЛЬКО если
 * жест начался на уже выделенном объекте. Иначе любой drag — это камера.
 * Это устраняет главную ошибку тач-планировщиков: случайное смещение
 * мебели при попытке покрутить сцену.
 *
 * Класс не знает про Three.js и DOM-разметку — только про указатели.
 * Решение «попал ли в выделение» принимает вызывающий код через isOnSelection.
 */
export class GestureController {
  private readonly pointers = new Map<number, Vector2>();
  private startPoint = new Vector2();
  private startTime = 0;
  private lastTapTime = 0;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private dragging = false;
  private dragOnSelection = false;
  private moved = false;

  private pinchStartDistance = 0;
  private pinchStartAngle = 0;
  private twoFingerCenter = new Vector2();

  constructor(
    private readonly element: HTMLElement,
    private readonly handlers: {
      onGesture: (e: GestureEvent) => void;
      /** Возвращает true, если точка попадает в выделенный объект */
      isOnSelection: (point: Vector2) => boolean;
      /** Тактильный отклик при срабатывании привязки */
      haptic?: (pattern: number | number[]) => void;
    },
  ) {
    // passive:false нужен, чтобы отменять браузерный скролл и зум страницы
    element.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    element.addEventListener('pointermove', this.onPointerMove, { passive: false });
    element.addEventListener('pointerup', this.onPointerUp, { passive: false });
    element.addEventListener('pointercancel', this.onPointerUp, { passive: false });
    // Без этого iOS Safari перехватывает жесты для зума страницы
    element.style.touchAction = 'none';
  }

  private onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.element.setPointerCapture(e.pointerId);
    const point = new Vector2(e.clientX, e.clientY);
    this.pointers.set(e.pointerId, point);

    if (this.pointers.size === 1) {
      this.startPoint.copy(point);
      this.startTime = performance.now();
      this.moved = false;
      this.dragOnSelection = this.handlers.isOnSelection(point);

      this.longPressTimer = setTimeout(() => {
        if (!this.moved && this.pointers.size === 1) {
          this.handlers.haptic?.(10);
          this.handlers.onGesture({ type: 'longPress', point: point.clone() });
          this.longPressTimer = null;
        }
      }, LONG_PRESS_MS);
    } else if (this.pointers.size === 2) {
      this.cancelLongPress();
      // Второй палец отменяет начатое перетаскивание объекта
      if (this.dragging) {
        this.handlers.onGesture({
          type: 'dragEnd',
          point: this.startPoint.clone(),
          onSelection: this.dragOnSelection,
        });
        this.dragging = false;
      }
      const [a, b] = [...this.pointers.values()];
      this.pinchStartDistance = a.distanceTo(b);
      this.pinchStartAngle = Math.atan2(b.y - a.y, b.x - a.x);
      this.twoFingerCenter.copy(a).add(b).multiplyScalar(0.5);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    e.preventDefault();

    const prev = this.pointers.get(e.pointerId)!;
    const point = new Vector2(e.clientX, e.clientY);
    const delta = point.clone().sub(prev);
    this.pointers.set(e.pointerId, point);

    if (this.pointers.size === 1) {
      if (!this.moved && this.startPoint.distanceTo(point) > TAP_MAX_MOVE_PX) {
        this.moved = true;
        this.cancelLongPress();
        this.dragging = true;
        this.handlers.onGesture({
          type: 'dragStart',
          point: this.startPoint.clone(),
          onSelection: this.dragOnSelection,
        });
      }
      if (this.dragging) {
        this.handlers.onGesture({
          type: 'dragMove',
          point,
          delta,
          onSelection: this.dragOnSelection,
        });
      }
      return;
    }

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = a.distanceTo(b);
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const center = a.clone().add(b).multiplyScalar(0.5);

      if (this.pinchStartDistance > 0) {
        const scale = distance / this.pinchStartDistance;
        // Порог, чтобы дрожание пальцев не считалось зумом
        if (Math.abs(scale - 1) > 0.02) {
          this.handlers.onGesture({ type: 'pinch', scale, center: center.clone() });
          this.pinchStartDistance = distance;
        }
      }

      const panDelta = center.clone().sub(this.twoFingerCenter);
      if (panDelta.length() > 1) {
        this.handlers.onGesture({ type: 'twoFingerPan', delta: panDelta });
        this.twoFingerCenter.copy(center);
      }

      const rotation = angle - this.pinchStartAngle;
      if (Math.abs(rotation) > 0.05) {
        this.handlers.onGesture({ type: 'twoFingerRotate', angle: rotation });
        this.pinchStartAngle = angle;
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    e.preventDefault();
    const point = this.pointers.get(e.pointerId)!.clone();
    this.pointers.delete(e.pointerId);
    this.cancelLongPress();

    if (this.dragging && this.pointers.size === 0) {
      this.handlers.onGesture({ type: 'dragEnd', point, onSelection: this.dragOnSelection });
      this.dragging = false;
      return;
    }

    const duration = performance.now() - this.startTime;
    const isTap = !this.moved && duration < TAP_MAX_MS && this.pointers.size === 0;

    if (isTap) {
      const now = performance.now();
      if (now - this.lastTapTime < DOUBLE_TAP_MAX_MS) {
        this.handlers.onGesture({ type: 'doubleTap', point });
        this.lastTapTime = 0;
      } else {
        this.handlers.onGesture({ type: 'tap', point });
        this.lastTapTime = now;
      }
    }

    if (this.pointers.size === 0) {
      this.pinchStartDistance = 0;
    }
  };

  private cancelLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  dispose(): void {
    this.cancelLongPress();
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerUp);
    this.pointers.clear();
  }
}
