/**
 * Бюджеты производительности. Приёмочные значения из ТЗ (раздел 7).
 * Используются в рантайме адаптивным качеством и в CI перф-гейтом.
 * Менять только вместе с пересмотром ТЗ.
 */

export type DeviceTier = 'low' | 'mid' | 'high' | 'desktop';

export interface RenderBudget {
  readonly maxTriangles: number;
  readonly maxDrawCalls: number;
  /** Байты видеопамяти под текстуры */
  readonly maxTextureBytes: number;
  readonly maxUniqueMaterials: number;
  /** Верхняя граница devicePixelRatio */
  readonly maxPixelRatio: number;
  readonly targetFps: number;
  /** Ниже этого значения качество понижается на ступень */
  readonly floorFps: number;
}

export const RENDER_BUDGETS: Record<DeviceTier, RenderBudget> = {
  low: {
    maxTriangles: 120_000,
    maxDrawCalls: 50,
    maxTextureBytes: 64 * 1024 * 1024,
    maxUniqueMaterials: 15,
    maxPixelRatio: 1,
    targetFps: 30,
    floorFps: 24,
  },
  mid: {
    maxTriangles: 250_000,
    maxDrawCalls: 80,
    maxTextureBytes: 120 * 1024 * 1024,
    maxUniqueMaterials: 25,
    maxPixelRatio: 1.5,
    targetFps: 60,
    floorFps: 45,
  },
  high: {
    maxTriangles: 600_000,
    maxDrawCalls: 150,
    maxTextureBytes: 250 * 1024 * 1024,
    maxUniqueMaterials: 40,
    maxPixelRatio: 2,
    targetFps: 60,
    floorFps: 50,
  },
  desktop: {
    maxTriangles: 1_500_000,
    maxDrawCalls: 300,
    maxTextureBytes: 600 * 1024 * 1024,
    maxUniqueMaterials: 80,
    maxPixelRatio: 2,
    targetFps: 60,
    floorFps: 50,
  },
} as const;

/** Бюджеты загрузки. Проверяются в CI (tests/perf + size-limit). */
export const LOAD_BUDGETS = {
  /** embed.js — шелл до взаимодействия, gzip */
  embedShellBytes: 8 * 1024,
  /** Ленивый чанк 3D-движка, gzip */
  engineChunkBytes: 500 * 1024,
  /** Первый кадр 3D, мс, 4G + mid-устройство */
  timeToFirstFrameMs: 2000,
  /** Смена материала при закэшированной текстуре, мс */
  materialSwapMs: 100,
  /** Добавление объекта, модель не в кэше, мс */
  objectAddMs: 400,
  /** Загрузка сцены на 30 объектов, мс */
  sceneLoadMs: 3500,
  interactionToNextPaintMs: 200,
  /** Максимальный размер одной модели после сжатия, байты */
  maxModelBytes: { mobile: 1_500_000, tablet: 2_500_000, desktop: 4_000_000 },
} as const;

/** Пороги валидации ассетов в пайплайне (tools/pipeline). */
export const ASSET_BUDGETS = {
  lod0MaxTriangles: 80_000,
  lod1Ratio: 0.5,
  lod2Ratio: 0.2,
  maxTextureSize: 2048,
  maxMaterialsPerAsset: 8,
  requiredFormats: ['gltf', 'usdz', 'thumb'] as const,
} as const;
