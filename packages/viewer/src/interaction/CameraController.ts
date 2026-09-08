import { MathUtils, PerspectiveCamera, Plane, Raycaster, Spherical, Vector2, Vector3 } from 'three';

/**
 * Управление камерой: орбита, панорама, зум и проекция экрана на пол.
 *
 * Живёт в чистом Three.js без Vue: это горячий путь, он вызывается на
 * каждое событие указателя (CLAUDE.md, правило 2).
 *
 * Внутреннее состояние — сферические координаты вокруг точки интереса.
 * Матрица камеры пересобирается из них, а не накапливает повороты:
 * накопление кватернионов за сотни событий даёт заметный дрейф крена.
 */

export interface CameraLimits {
  /** Метры */
  minDistance: number;
  maxDistance: number;
  /** Радианы от вертикали. Ниже горизонта камера не опускается */
  minPolar: number;
  maxPolar: number;
  /** Предел удаления точки интереса от начала координат, метры */
  maxTargetRadius: number;
}

export const DEFAULT_LIMITS: CameraLimits = {
  minDistance: 0.8,
  maxDistance: 40,
  minPolar: 0.05,
  // Чуть меньше 90°: ровно на горизонте пол вырождается в линию,
  // проекция экрана на пол уходит в бесконечность
  maxPolar: Math.PI / 2 - 0.02,
  maxTargetRadius: 30,
};

/** Пол сцены. Мебель стоит на y = 0, наклон не поддерживается. */
const FLOOR = new Plane(new Vector3(0, 1, 0), 0);

const ORBIT_SPEED = 0.008;

export class CameraController {
  readonly target = new Vector3(0, 0.4, 0);

  private readonly spherical = new Spherical();
  private readonly raycaster = new Raycaster();
  private viewport = new Vector2(1, 1);

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly limits: CameraLimits = DEFAULT_LIMITS,
  ) {
    const offset = camera.position.clone().sub(this.target);
    this.spherical.setFromVector3(offset);
    this.clampSpherical();
    this.apply();
  }

  setViewport(widthPx: number, heightPx: number): void {
    this.viewport.set(Math.max(1, widthPx), Math.max(1, heightPx));
  }

  get distance(): number {
    return this.spherical.radius;
  }

  /**
   * Масштаб сцены: сколько миллиметров мира приходится на пиксель экрана
   * в плоскости точки интереса.
   *
   * Нужен снаппингу: порог привязки задан в пикселях, и без пересчёта
   * привязка на отдалённой камере хватала бы объекты за метры (ТЗ 8.2).
   */
  get mmPerPixel(): number {
    const fovRad = MathUtils.degToRad(this.camera.fov);
    const worldHeight = 2 * this.spherical.radius * Math.tan(fovRad / 2);
    return (worldHeight / this.viewport.y) * 1000;
  }

  /** Вращение вокруг точки интереса. Смещение — в пикселях экрана. */
  orbit(deltaXPx: number, deltaYPx: number): void {
    this.spherical.theta -= deltaXPx * ORBIT_SPEED;
    this.spherical.phi -= deltaYPx * ORBIT_SPEED;
    this.clampSpherical();
    this.apply();
  }

  /**
   * Панорама: точка интереса едет в плоскости пола так, чтобы содержимое
   * следовало за пальцем. Смещение считается в мировых единицах через
   * mmPerPixel, иначе на разном зуме сцена уезжает с разной скоростью.
   */
  pan(deltaXPx: number, deltaYPx: number): void {
    const metersPerPixel = this.mmPerPixel / 1000;
    const right = new Vector3().setFromMatrixColumn(this.camera.matrix, 0).setY(0).normalize();
    // Вперёд по полу: направление взгляда, спроецированное на плоскость
    const forward = new Vector3().crossVectors(new Vector3(0, 1, 0), right).normalize();

    this.target
      .addScaledVector(right, -deltaXPx * metersPerPixel)
      .addScaledVector(forward, -deltaYPx * metersPerPixel);

    this.clampTarget();
    this.apply();
  }

  /** Пинч: scale > 1 приближает. */
  zoom(scale: number): void {
    if (scale <= 0) return;
    this.spherical.radius /= scale;
    this.clampSpherical();
    this.apply();
  }

  /** Колесо мыши: положительный delta отдаляет. */
  dolly(deltaPx: number): void {
    this.zoom(Math.exp(-deltaPx * 0.001));
  }

  /**
   * Точка пола под экранной координатой. null, если луч уходит выше
   * горизонта — это возможно у края экрана даже при ограниченном угле.
   */
  projectToFloor(ndc: Vector2): Vector3 | null {
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new Vector3();
    return this.raycaster.ray.intersectPlane(FLOOR, hit) ? hit : null;
  }

  /** Пиксели канваса -> нормализованные координаты устройства. */
  toNdc(xPx: number, yPx: number, out = new Vector2()): Vector2 {
    return out.set((xPx / this.viewport.x) * 2 - 1, -(yPx / this.viewport.y) * 2 + 1);
  }

  /** Кадрирование сцены: вписывает окружность радиуса radiusM в экран. */
  frame(radiusM: number): void {
    const fovRad = MathUtils.degToRad(this.camera.fov);
    this.spherical.radius = radiusM / Math.tan(fovRad / 2);
    this.clampSpherical();
    this.apply();
  }

  private clampSpherical(): void {
    this.spherical.radius = MathUtils.clamp(
      this.spherical.radius,
      this.limits.minDistance,
      this.limits.maxDistance,
    );
    this.spherical.phi = MathUtils.clamp(
      this.spherical.phi,
      this.limits.minPolar,
      this.limits.maxPolar,
    );
    this.spherical.makeSafe();
  }

  private clampTarget(): void {
    const horizontal = new Vector2(this.target.x, this.target.z);
    if (horizontal.length() > this.limits.maxTargetRadius) {
      horizontal.setLength(this.limits.maxTargetRadius);
      this.target.x = horizontal.x;
      this.target.z = horizontal.y;
    }
  }

  private apply(): void {
    this.camera.position.setFromSpherical(this.spherical).add(this.target);
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }
}
