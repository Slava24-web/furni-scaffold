import { Vector2 } from 'three';
import {
  dockCandidates,
  overlayCandidates,
  verticallyOverlapping,
  type Box,
} from '@furni/shared';

/** Точечная цель: центр другого объекта, узел сетки, ось. */
export interface PointSnapTarget {
  kind: 'object' | 'grid' | 'axis';
  /** Позиция в мировых мм */
  position: Vector2;
  /** Угол выравнивания в градусах, если цель его задаёт */
  rotation?: number;
  sourceId?: string;
  /**
   * Габарит цели. Если задан, цель участвует в стыковке или выравнивании
   * и НЕ участвует в притягивании к центру: совмещение центров всегда
   * означает наложение объектов друг на друга.
   *
   * Диапазон высот решает, что именно предложить: пересекающиеся по
   * высоте объекты стыкуются боками, непересекающиеся выравниваются
   * друг над другом.
   */
  footprint?: { halfWidthMm: number; halfDepthMm: number; bottomMm: number; topMm: number };
}

/**
 * Стена как цель привязки: отрезок, а не точка.
 *
 * Мебель встаёт вплотную к внутренней грани в любом месте вдоль стены,
 * поэтому расстояние считается до отрезка, а не до его середины.
 */
export interface WallSnapTarget {
  kind: 'wall';
  /** Концы осевой линии стены, мм */
  a: Vector2;
  b: Vector2;
  /** Единичная нормаль, направленная внутрь помещения */
  normal: Vector2;
  /** Половина толщины стены: внутренняя грань смещена на неё от оси */
  halfThicknessMm: number;
  sourceId?: string;
}

export type SnapTarget = PointSnapTarget | WallSnapTarget;

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
  /**
   * Половина глубины перетаскиваемого объекта, мм. На столько его центр
   * отстоит от внутренней грани стены, когда объект стоит вплотную.
   * Ноль означает «центром на грань» и годится только для точечных целей.
   */
  objectHalfDepthMm?: number;
  /** Половина ширины перетаскиваемого объекта, мм. Нужна для стыковки. */
  objectHalfWidthMm?: number;
  /** Диапазон высот перетаскиваемого объекта, мм. */
  objectBottomMm?: number;
  objectTopMm?: number;
}

export const DEFAULT_SNAP: Omit<SnapConfig, 'mmPerPixel'> = {
  thresholdPx: 12,
  gridStepMm: 50,
  enableGrid: true,
  enableWalls: true,
  enableObjects: true,
  objectHalfDepthMm: 0,
  objectHalfWidthMm: 0,
  objectBottomMm: 0,
  objectTopMm: 0,
};

interface Candidate {
  position: Vector2;
  rotation: number | null;
  target: SnapTarget;
  distanceMm: number;
}

/**
 * Магнитное примагничивание.
 *
 * Порядок приоритета: стыковка с соседом -> стена -> центр объекта -> сетка.
 * Стыковка важнее стены: модуль, поставленный рядом с соседом, который уже
 * стоит у стены, оказывается и у стены тоже, а обратное неверно — привязка
 * к стене оставила бы между модулями произвольный зазор.
 */
export class SnapEngine {
  private targets: SnapTarget[] = [];

  setTargets(targets: SnapTarget[]): void {
    this.targets = targets;
  }

  snap(desired: Vector2, config: SnapConfig): SnapResult {
    const thresholdMm = config.thresholdPx * config.mmPerPixel;

    const best =
      this.bestOf(this.neighbourCandidates(desired, config), thresholdMm) ??
      this.bestOf(this.wallCandidates(desired, config), thresholdMm) ??
      this.bestOf(this.objectCandidates(desired, config), thresholdMm);

    if (best) {
      return {
        position: best.position,
        rotation: best.rotation,
        target: best.target,
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

  private bestOf(candidates: Candidate[], thresholdMm: number): Candidate | null {
    let best: Candidate | null = null;
    for (const candidate of candidates) {
      if (candidate.distanceMm >= thresholdMm) continue;
      if (!best || candidate.distanceMm < best.distanceMm) best = candidate;
    }
    return best;
  }

  /**
   * Позиции относительно соседа: стыковка боками или выравнивание поверх.
   *
   * Что предложить, решает перекрытие по высоте. Модули одного ряда
   * стыкуются гранями и собираются без зазоров. Столешница и верхний
   * шкаф по высоте с нижним рядом не пересекаются — их надо не ставить
   * рядом, а выравнивать над ним, иначе столешница уезжает вбок от тумбы.
   */
  private neighbourCandidates(desired: Vector2, config: SnapConfig): Candidate[] {
    if (!config.enableObjects) return [];

    const halfWidth = config.objectHalfWidthMm ?? 0;
    const halfDepth = config.objectHalfDepthMm ?? 0;
    if (halfWidth <= 0 && halfDepth <= 0) return [];

    const moving = {
      bottomMm: config.objectBottomMm ?? 0,
      topMm: config.objectTopMm ?? 0,
    };

    const candidates: Candidate[] = [];
    for (const target of this.targets) {
      if (target.kind !== 'object' || !target.footprint) continue;

      const box: Box = {
        centre: { x: target.position.x, y: target.position.y },
        halfWidthMm: target.footprint.halfWidthMm,
        halfDepthMm: target.footprint.halfDepthMm,
        rotationDeg: target.rotation ?? 0,
        bottomMm: target.footprint.bottomMm,
        topMm: target.footprint.topMm,
      };

      const sideBySide =
        moving.topMm <= moving.bottomMm || verticallyOverlapping(box, moving);

      const positions = sideBySide
        ? dockCandidates(box, halfWidth, halfDepth)
        : overlayCandidates(box, halfWidth, halfDepth);

      for (const option of positions) {
        const position = new Vector2(option.position.x, option.position.y);
        candidates.push({
          position,
          rotation: option.rotationDeg,
          target,
          distanceMm: desired.distanceTo(position),
        });
      }
    }
    return candidates;
  }

  private objectCandidates(desired: Vector2, config: SnapConfig): Candidate[] {
    if (!config.enableObjects) return [];

    const candidates: Candidate[] = [];
    for (const target of this.targets) {
      if (target.kind === 'wall' || target.kind === 'grid') continue;
      // Габарит известен — значит цель уже дала точки стыковки,
      // а совмещение центров поставило бы объекты друг на друга
      if (target.footprint) continue;
      candidates.push({
        position: target.position.clone(),
        rotation: target.rotation ?? null,
        target,
        distanceMm: desired.distanceTo(target.position),
      });
    }
    return candidates;
  }

  /**
   * Кандидат у стены: проекция точки на отрезок, вынесенная внутрь
   * помещения на половину толщины стены плюс половину глубины объекта.
   * Расстояние меряется до самой позиции постановки — то есть до того,
   * насколько далеко объект «прыгнет». Так порог в пикселях означает
   * ровно то, что видит пользователь.
   */
  private wallCandidates(desired: Vector2, config: SnapConfig): Candidate[] {
    if (!config.enableWalls) return [];
    const halfDepth = config.objectHalfDepthMm ?? 0;

    const candidates: Candidate[] = [];
    for (const target of this.targets) {
      if (target.kind !== 'wall') continue;

      // От оси до внутренней грани — половина толщины стены, дальше
      // до центра объекта — половина его глубины
      const offset = target.halfThicknessMm + halfDepth;
      const projected = projectOnSegment(desired, target.a, target.b);
      const position = new Vector2(
        projected.x + target.normal.x * offset,
        projected.y + target.normal.y * offset,
      );

      candidates.push({
        position,
        // Объект разворачивается спиной к стене: локальная ось +Z
        // смотрит вдоль внутренней нормали
        rotation: normalToRotationDeg(target.normal),
        target,
        distanceMm: desired.distanceTo(position),
      });
    }
    return candidates;
  }
}

/** Проекция точки на отрезок с обрезанием по его концам. */
export function projectOnSegment(point: Vector2, a: Vector2, b: Vector2): Vector2 {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq === 0) return a.clone();

  const t = Math.min(1, Math.max(0, ((point.x - a.x) * abx + (point.y - a.y) * aby) / lengthSq));
  return new Vector2(a.x + abx * t, a.y + aby * t);
}

/**
 * Угол поворота объекта, при котором его фасад смотрит вдоль нормали.
 * Поворот вокруг Y на φ переводит локальную +Z в (sin φ, cos φ) плана.
 */
export function normalToRotationDeg(normal: Vector2): number {
  return (Math.atan2(normal.x, normal.y) * 180) / Math.PI;
}
