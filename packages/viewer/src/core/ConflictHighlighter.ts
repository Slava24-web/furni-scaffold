import { Box3, Box3Helper, Color, LineBasicMaterial, type Object3D, type Scene } from 'three';

/**
 * Подсветка объектов, с которыми конфликтует выделенный.
 *
 * Красная рамка на выделении говорит, ЧТО что-то не так, но не говорит,
 * с чем именно: на плотной кухне пользователь не понимает, какой модуль
 * мешает. Здесь подсвечиваются сами виновники.
 *
 * Рамки берутся из пула и переиспользуются: конфликты возникают и
 * исчезают на каждом движении указателя, а создание Box3Helper это
 * выделение буферов GPU в горячем пути.
 */

const CONFLICT_COLOR = 0xd92d20;

/**
 * Предел числа подсвеченных рамок.
 *
 * Каждая стоит draw call, а бюджет жёсткий (RENDER_BUDGETS.maxDrawCalls).
 * Реальный конфликт это один-два соседа; если их больше десятка, проблема
 * видна и без полной подсветки.
 */
export const MAX_HIGHLIGHTS = 12;

interface PooledHelper {
  helper: Box3Helper;
  box: Box3;
  material: LineBasicMaterial;
}

export class ConflictHighlighter {
  private readonly pool: PooledHelper[] = [];
  private active = 0;

  constructor(private readonly scene: Scene) {}

  /** Число реально показанных рамок — для тестов и отладки. */
  get visibleCount(): number {
    return this.active;
  }

  show(targets: readonly Object3D[]): void {
    const shown = Math.min(targets.length, MAX_HIGHLIGHTS);

    for (let index = 0; index < shown; index++) {
      const entry = this.acquire(index);
      entry.box.setFromObject(targets[index]!);
      entry.helper.visible = true;
    }

    for (let index = shown; index < this.pool.length; index++) {
      this.pool[index]!.helper.visible = false;
    }

    this.active = shown;
  }

  clear(): void {
    for (const entry of this.pool) entry.helper.visible = false;
    this.active = 0;
  }

  private acquire(index: number): PooledHelper {
    const existing = this.pool[index];
    if (existing) return existing;

    const box = new Box3();
    const helper = new Box3Helper(box, new Color(CONFLICT_COLOR));
    helper.visible = false;
    // Поверх мебели: рамка проходит внутри объекта и иначе теряется
    helper.renderOrder = 998;

    const material = helper.material as LineBasicMaterial;
    material.depthTest = false;

    const entry: PooledHelper = { helper, box, material };
    this.pool.push(entry);
    this.scene.add(helper);
    return entry;
  }

  dispose(): void {
    for (const entry of this.pool) {
      this.scene.remove(entry.helper);
      entry.helper.geometry.dispose();
      entry.material.dispose();
    }
    this.pool.length = 0;
    this.active = 0;
  }
}
