import { Box3, Box3Helper, Color, LineBasicMaterial, type Object3D, type Scene } from 'three';

/**
 * Подсветка выделенного объекта габаритной рамкой.
 *
 * Один Box3Helper на всю сцену, переиспользуется между выделениями:
 * создавать хелпер на каждый клик значит выделять и освобождать буферы
 * GPU в горячем пути. Стоит один draw call.
 */

/** Обычное выделение и выделение с конфликтом. */
const NORMAL_COLOR = 0x2f6fed;
const CONFLICT_COLOR = 0xd92d20;

export class SelectionIndicator {
  private readonly box = new Box3();
  private readonly helper: Box3Helper;
  private readonly material: LineBasicMaterial;
  private conflict = false;

  constructor(private readonly scene: Scene) {
    this.helper = new Box3Helper(this.box, new Color(NORMAL_COLOR));
    this.helper.visible = false;
    // Рамка не должна перекрываться мебелью, внутри которой она проходит
    this.helper.renderOrder = 999;

    // Box3Helper всегда строится с единственным LineBasicMaterial,
    // но в типах объявлен обобщённый Material
    this.material = this.helper.material as LineBasicMaterial;
    this.material.depthTest = false;

    scene.add(this.helper);
  }

  show(target: Object3D): void {
    this.box.setFromObject(target);
    this.helper.visible = true;
  }

  hide(): void {
    this.helper.visible = false;
  }

  /**
   * Красная рамка при пересечении с обстановкой.
   *
   * Конфликт подсвечивается, а не запрещает движение: заблокированное
   * перетаскивание ощущается как поломка, и протащить предмет мимо
   * препятствия стало бы невозможно.
   */
  setConflict(conflict: boolean): void {
    if (this.conflict === conflict) return;
    this.conflict = conflict;
    this.material.color.setHex(conflict ? CONFLICT_COLOR : NORMAL_COLOR);
  }

  /** Пересчёт после перемещения объекта. */
  refresh(target: Object3D | null): void {
    if (!target) return this.hide();
    this.box.setFromObject(target);
  }

  dispose(): void {
    this.scene.remove(this.helper);
    this.helper.geometry.dispose();
    this.material.dispose();
  }
}
