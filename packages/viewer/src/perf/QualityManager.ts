import type { WebGLRenderer } from 'three';
import { RENDER_BUDGETS, type DeviceTier, type RenderBudget } from '@furni/shared';
import { detectTier } from './detectTier';
import type { Telemetry } from './Telemetry';

export type QualityLevel = 0 | 1 | 2 | 3;

export interface QualitySettings {
  pixelRatio: number;
  antialias: boolean;
  /** Контактные тени и SSAO — только в refined-режиме */
  postEffects: boolean;
  /** Смещение порогов LOD: больше — раньше переключаемся на низкий LOD */
  lodBias: number;
  maxAnisotropy: number;
}

const LEVELS: Record<QualityLevel, Omit<QualitySettings, 'pixelRatio'>> = {
  0: { antialias: true, postEffects: true, lodBias: 1.0, maxAnisotropy: 8 },
  1: { antialias: true, postEffects: false, lodBias: 1.3, maxAnisotropy: 4 },
  2: { antialias: false, postEffects: false, lodBias: 1.8, maxAnisotropy: 2 },
  3: { antialias: false, postEffects: false, lodBias: 2.5, maxAnisotropy: 1 },
};

const DEGRADE_AFTER_MS = 5000;
const UPGRADE_AFTER_MS = 15000;

/**
 * Адаптивное качество. Понижает настройки при устойчивой просадке fps
 * и осторожно повышает, если запас стабилен.
 *
 * Требование ТЗ 7.4: деградация происходит молча, без уведомления пользователя.
 */
export class QualityManager {
  readonly tier: DeviceTier;
  readonly budget: RenderBudget;
  private level: QualityLevel = 0;
  private belowFloorSince: number | null = null;
  private aboveTargetSince: number | null = null;
  private readonly listeners = new Set<(s: QualitySettings) => void>();

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly telemetry: Telemetry,
    forceTier?: DeviceTier,
  ) {
    this.tier = forceTier ?? detectTier(renderer);
    this.budget = RENDER_BUDGETS[this.tier];
    // Слабые устройства стартуют сразу с пониженного качества,
    // чтобы пользователь не увидел просадку в первые секунды.
    this.level = this.tier === 'low' ? 2 : this.tier === 'mid' ? 1 : 0;
  }

  get settings(): QualitySettings {
    return { ...LEVELS[this.level], pixelRatio: this.pixelRatio };
  }

  get pixelRatio(): number {
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    const penalty = this.level >= 2 ? 0.75 : 1;
    return Math.min(dpr * penalty, this.budget.maxPixelRatio);
  }

  onChange(fn: (s: QualitySettings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  tick(): void {
    const now = performance.now();
    const fps = this.telemetry.recentFps(90);

    if (fps < this.budget.floorFps) {
      this.aboveTargetSince = null;
      this.belowFloorSince ??= now;
      if (now - this.belowFloorSince > DEGRADE_AFTER_MS && this.level < 3) {
        this.setLevel((this.level + 1) as QualityLevel);
        this.belowFloorSince = null;
      }
      return;
    }

    this.belowFloorSince = null;

    // Повышаем только при заметном запасе, чтобы не осциллировать
    if (fps > this.budget.targetFps * 0.95 && this.level > 0) {
      this.aboveTargetSince ??= now;
      if (now - this.aboveTargetSince > UPGRADE_AFTER_MS) {
        this.setLevel((this.level - 1) as QualityLevel);
        this.aboveTargetSince = null;
      }
    } else {
      this.aboveTargetSince = null;
    }
  }

  private setLevel(level: QualityLevel): void {
    if (level === this.level) return;
    this.level = level;
    const s = this.settings;
    this.renderer.setPixelRatio(s.pixelRatio);
    for (const fn of this.listeners) fn(s);
  }

  /** Проверка бюджета. Используется перф-гейтом в CI. */
  checkBudget(): { ok: boolean; violations: string[] } {
    const snap = this.telemetry.snapshot();
    const violations: string[] = [];
    if (snap.drawCalls > this.budget.maxDrawCalls) {
      violations.push(`draw calls ${snap.drawCalls} > ${this.budget.maxDrawCalls}`);
    }
    if (snap.triangles > this.budget.maxTriangles) {
      violations.push(`треугольники ${snap.triangles} > ${this.budget.maxTriangles}`);
    }
    if (snap.fpsP50 < this.budget.targetFps * 0.95) {
      violations.push(`fps p50 ${snap.fpsP50} < ${this.budget.targetFps}`);
    }
    if (snap.fpsP95 < this.budget.floorFps) {
      violations.push(`fps p95 ${snap.fpsP95} < ${this.budget.floorFps}`);
    }
    return { ok: violations.length === 0, violations };
  }
}
