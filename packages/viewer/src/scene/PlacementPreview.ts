import { DoubleSide, Group, Mesh, MeshBasicMaterial, type Scene } from 'three';

/**
 * Предварительное положение объекта при переносе из каталога.
 *
 * Без него пользователь бросает вслепую: точка отпускания и место, куда
 * встанет объект, различаются — работают привязка к стене, стыковка с
 * соседом и высота установки. Призрак показывает итог до отпускания.
 *
 * Материал общий и полупрозрачный, а не оригинальные материалы модели:
 * они разделяются с кэшем загрузчика (userData.shared), и менять у них
 * прозрачность значило бы сделать призрачными все копии модели в сцене.
 */

const NORMAL_COLOR = 0x2f6fed;
const CONFLICT_COLOR = 0xd92d20;
const MM = 1000;

export class PlacementPreview {
  private readonly material: MeshBasicMaterial;
  private root: Group | null = null;
  private conflict = false;

  constructor(private readonly scene: Scene) {
    this.material = new MeshBasicMaterial({
      color: NORMAL_COLOR,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      side: DoubleSide,
    });
  }

  get visible(): boolean {
    return this.root !== null;
  }

  /**
   * Показать призрак. Группа приходит из загрузчика и уже является клоном,
   * поэтому подмена материала не трогает остальные копии модели.
   */
  show(group: Group): void {
    this.hide();

    group.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh) mesh.material = this.material;
    });

    this.root = group;
    this.scene.add(group);
    this.applyConflictColour();
  }

  /** Положение в миллиметрах и разворот в градусах — как в документе сцены. */
  setTransform(xMm: number, yMm: number, zMm: number, rotationDeg: number): void {
    if (!this.root) return;
    this.root.position.set(xMm / MM, yMm / MM, zMm / MM);
    this.root.rotation.y = (rotationDeg * Math.PI) / 180;
  }

  setConflict(conflict: boolean): void {
    if (this.conflict === conflict) return;
    this.conflict = conflict;
    this.applyConflictColour();
  }

  hide(): void {
    if (this.root) this.scene.remove(this.root);
    this.root = null;
  }

  private applyConflictColour(): void {
    this.material.color.setHex(this.conflict ? CONFLICT_COLOR : NORMAL_COLOR);
  }

  dispose(): void {
    this.hide();
    this.material.dispose();
  }
}
