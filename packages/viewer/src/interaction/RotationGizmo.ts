import {
  Box3,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Vector3,
  type Object3D,
  type Scene,
} from 'three';

/**
 * Кольцо поворота вокруг выделенного объекта.
 *
 * Поворот свободный, на любой угол: мебель ставят не только по осям, и
 * шаг в 90° сделал бы невозможными угловые и диагональные раскладки.
 * Кратные углы всё равно достижимы — их даёт привязка к стене и стыковка
 * с соседом, которые наследуют его разворот.
 *
 * Кольцо лежит в плоскости пола у основания объекта: так его видно
 * с любого ракурса и оно не спорит с габаритной рамкой выделения.
 */

const RING_COLOR = 0x2f6fed;
/** Запас от габарита объекта до кольца, метры. */
const MARGIN_M = 0.12;
/** Толщина кольца, метры. Достаточная, чтобы попасть пальцем. */
const THICKNESS_M = 0.07;
const SEGMENTS = 48;

export class RotationGizmo {
  readonly mesh: Mesh;

  private readonly material: MeshBasicMaterial;
  private readonly box = new Box3();
  private readonly centre = new Vector3();
  private radius = 1;

  constructor(private readonly scene: Scene) {
    this.material = new MeshBasicMaterial({
      color: RING_COLOR,
      transparent: true,
      opacity: 0.55,
      side: DoubleSide,
      depthTest: false,
    });

    this.mesh = new Mesh(this.ringGeometry(1), this.material);
    this.mesh.name = 'rotation-gizmo';
    this.mesh.renderOrder = 997;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  get visible(): boolean {
    return this.mesh.visible;
  }

  /** Показать кольцо вокруг объекта и подогнать его размер под габарит. */
  attach(target: Object3D): void {
    this.update(target);
    this.mesh.visible = true;
  }

  /** Пересчёт после перемещения или поворота объекта. */
  update(target: Object3D): void {
    this.box.setFromObject(target);
    if (this.box.isEmpty()) return;

    this.box.getCenter(this.centre);
    const size = this.box.getSize(new Vector3());
    const radius = Math.max(size.x, size.z) / 2 + MARGIN_M;

    if (Math.abs(radius - this.radius) > 1e-3) {
      // Геометрия пересобирается только при заметной смене габарита:
      // объект двигают на каждое событие указателя, и пересборка кольца
      // в этом цикле означала бы постоянные выделения буферов
      this.mesh.geometry.dispose();
      this.mesh.geometry = this.ringGeometry(radius);
      this.radius = radius;
    }

    // У основания объекта: кольцо на уровне пола читается как «повернуть»
    this.mesh.position.set(this.centre.x, this.box.min.y + 0.005, this.centre.z);
  }

  detach(): void {
    this.mesh.visible = false;
  }

  private ringGeometry(radiusM: number): RingGeometry {
    const geometry = new RingGeometry(
      Math.max(0.02, radiusM - THICKNESS_M),
      radiusM,
      SEGMENTS,
    );
    // RingGeometry строится в плоскости XY, а кольцо должно лежать на полу
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
