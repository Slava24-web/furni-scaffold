import { Vector2 } from 'three';

export interface SnapTarget {
  kind: 'wall' | 'object' | 'grid' | 'axis';
  /** Позиция в мировых мм */
  position: Vector2;
  /** Угол выравнивания в градусах, если цель его задаёт */
  rotation?: number;
  sourceId?: string;
}

export interface SnapResult {
  position: Vector2;
  rotation: number | null;
  target: SnapTarget | null;
  /** Сработала ли привязка — для тактильного отклика */
  snapped: boolean;
}

export interface SnapConfig {
  /** Порог в ПИКСЕЛЯХ ЭКРАНА, не в мировых единицах.
   *  Иначе на разном зуме привязка ведёт себя по-разному (ТЗ 8.2). */
  thresholdPx: number;
  gridStepMm: number;
  /** мм на пиксель при текущем зуме */
  mmPerPixel: number;
  enableGrid: boolean;
  enableWalls: boolean;
  enableObjects: boolean;
}

export const DEFAULT_SNAP: Omit<SnapConfig, 'mmPerPixel'> = {
  thresholdPx: 12,
  gridStepMm: 50,
  enableGrid: true,
  enableWalls: true,
  enableObjects: true,
};

/**
 * Магнитное примагничивание. Порядок приоритета: стены -> объекты -> сетка.
 * Стены важнее сетки: мебель у стены должна вставать вплотную, а не по сетке.
 */
export class SnapEngine {
  private targets: SnapTarget[] = [];

  setTargets(targets: SnapTarget[]): void {
    this.targets = targets;
  }

  snap(desired: Vector2, config: SnapConfig): SnapResult {
    const thresholdMm = config.thresholdPx * config.mmPerPixel;
    let best: SnapTarget | null = null;
    let bestDist = Infinity;

    for (const t of this.targets) {
      if (t.kind === 'wall' && !config.enableWalls) continue;
      if (t.kind === 'object' && !config.enableObjects) continue;
      const d = desired.distanceTo(t.position);
      if (d < thresholdMm && d < bestDist) {
        best = t;
        bestDist = d;
      }
    }

    if (best) {
      return {
        position: best.position.clone(),
        rotation: best.rotation ?? null,
        target: best,
        snapped: true,
      };
    }

    if (config.enableGrid) {
      const step = config.gridStepMm;
      const snapped = new Vector2(
        Math.round(desired.x / step) * step,
        Math.round(desired.y / step) * step,
      );
      const wasSnapped = snapped.distanceTo(desired) > 0.5;
      return {
        position: snapped,
        rotation: null,
        target: wasSnapped ? { kind: 'grid', position: snapped } : null,
        snapped: false, // сетка не даёт тактильный отклик — слишком часто
      };
    }

    return { position: desired.clone(), rotation: null, target: null, snapped: false };
  }
}
