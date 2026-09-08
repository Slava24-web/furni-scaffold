import { Box3, Box3Helper, Color, type Object3D, type Scene } from 'three';

/**
 * Подсветка выделенного объекта габаритной рамкой.
 *
 * Один Box3Helper на всю сцену, переиспользуется между выделениями:
 * создавать хелпер на каждый клик значит выделять и освобождать буферы
 * GPU в горячем пути. Стоит один draw call.
 */
export class SelectionIndicator {
  private readonly box = new Box3();
  private readonly helper: Box3Helper;

  constructor(private readonly scene: Scene) {
    this.helper = new Box3Helper(this.box, new Color(0x2f6fed));
    this.helper.visible = false;
    // Рамка не должна перекрываться мебелью, внутри которой она проходит
    this.helper.renderOrder = 999;
    const material = this.helper.material;
    if (!Array.isArray(material)) material.depthTest = false;
    scene.add(this.helper);
  }

  show(target: Object3D): void {
    this.box.setFromObject(target);
    this.helper.visible = true;
  }

  hide(): void {
    this.helper.visible = false;
  }

  /** Пересчёт после перемещения объекта. */
  refresh(target: Object3D | null): void {
    if (!target) return this.hide();
    this.box.setFromObject(target);
  }

  dispose(): void {
    this.scene.remove(this.helper);
    this.helper.geometry.dispose();
    const material = this.helper.material;
    if (Array.isArray(material)) {
      for (const m of material) m.dispose();
    } else {
      material.dispose();
    }
  }
}
