import { Vector2 } from 'three';
import { CameraController } from '@furni/viewer';

/** Точка на полу помещения, мм. */
export interface FloorPoint {
  x: number;
  z: number;
}

/**
 * Перевод координат окна в координаты сцены.
 *
 * Единственный владелец прямоугольника канваса и камеры для расчётов.
 * getBoundingClientRect на каждое движение указателя — это принудительный
 * reflow в горячем пути, поэтому прямоугольник кэшируется, а обновляется
 * по ResizeObserver и на старте жеста.
 */
export class ScreenProjector {
  #camera: CameraController | null = null;
  #element: HTMLElement | null = null;
  #rect: DOMRect | null = null;
  /** Переиспользуемый вектор: NDC считается на каждое движение указателя. */
  readonly #ndc = new Vector2();

  attach(element: HTMLElement, camera: CameraController): void {
    this.#element = element;
    this.#camera = camera;
    this.refresh();
  }

  detach(): void {
    this.#element = null;
    this.#camera = null;
    this.#rect = null;
  }

  /** Камера нужна вызывающему для орбиты, зума и mmPerPixel. */
  get camera(): CameraController | null {
    return this.#camera;
  }

  get ready(): boolean {
    return this.#camera !== null;
  }

  /** Пересчёт прямоугольника канваса и вьюпорта камеры. */
  refresh(): { widthPx: number; heightPx: number } | null {
    if (!this.#element) return null;
    this.#rect = this.#element.getBoundingClientRect();
    this.#camera?.setViewport(this.#rect.width, this.#rect.height);
    return { widthPx: this.#rect.width, heightPx: this.#rect.height };
  }

  /** Клиентские координаты указателя -> NDC канваса. */
  toNdc(point: Vector2): Vector2 {
    if (!this.#rect || !this.#camera) return this.#ndc.set(0, 0);
    return this.#camera.toNdc(point.x - this.#rect.left, point.y - this.#rect.top, this.#ndc);
  }

  /**
   * Точка под координатой окна на горизонтальной плоскости высоты
   * `heightMm`, в мм. null — луч ушёл выше горизонта.
   *
   * Высота плоскости обязана совпадать с высотой постановки: луч,
   * нацеленный на крышку тумбы, пересекает пол далеко за ней, и позиция,
   * посчитанная по полу, уехала бы на метры от точки прицеливания.
   */
  floorPointAt(clientPoint: Vector2, heightMm = 0): FloorPoint | null {
    if (!this.#camera) return null;
    const hit = this.#camera.projectToPlane(this.toNdc(clientPoint), heightMm / 1000);
    return hit ? { x: hit.x * 1000, z: hit.z * 1000 } : null;
  }
}
