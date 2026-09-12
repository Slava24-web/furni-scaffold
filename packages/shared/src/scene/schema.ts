import { z } from 'zod';

/**
 * Документ сцены. Хранится в scenes.doc (JSONB).
 * ПРАВИЛО: никакой геометрии. Только ссылки на SKU и трансформации.
 * Все линейные размеры — миллиметры, целые. Углы — градусы.
 */

export const SCENE_DOC_VERSION = 1;

export const Vec2Mm = z.object({ x: z.number().int(), y: z.number().int() });
export const Vec3Mm = z.object({
  x: z.number().int(),
  y: z.number().int(),
  z: z.number().int(),
});

/** Стена задаётся отрезком по осевой линии + толщина. */
export const WallSchema = z.object({
  id: z.string().uuid(),
  start: Vec2Mm,
  end: Vec2Mm,
  thickness: z.number().int().min(50).max(1000).default(100),
  height: z.number().int().min(1000).max(6000).default(2700),
  materialId: z.string().nullable().default(null),
});

export const OpeningKind = z.enum(['door', 'window', 'arch', 'niche']);

/** Проём привязан к стене и смещению вдоль неё от start. */
export const OpeningSchema = z.object({
  id: z.string().uuid(),
  wallId: z.string().uuid(),
  kind: OpeningKind,
  offset: z.number().int().min(0),
  width: z.number().int().min(100),
  height: z.number().int().min(100),
  sillHeight: z.number().int().min(0).default(0),
  /** Зона открывания для проверки коллизий, мм. null = по ширине полотна */
  swingRadius: z.number().int().nullable().default(null),
  /** Сторона навески, считая от начала стены */
  hinge: z.enum(['left', 'right']).default('left'),
  /** Открывается внутрь помещения. Наружу открывают входные двери */
  swingInward: z.boolean().default(true),
  /** Изделие каталога в проёме: дверь или окно. null — голый проём */
  sku: z.string().nullable().default(null),
  /** Выбранные опции изделия: код группы -> код варианта */
  options: z.record(z.string(), z.string()).default({}),
});

/**
 * Инженерная точка: розетка, вывод воды, слив, вентканал, газ.
 *
 * Половина переделок на монтаже — из-за них: мойку нельзя поставить
 * вдали от стояка, вытяжку — вдали от канала, а посудомойке нужны сразу
 * вода, слив и розетка. Планировщик, который о них молчит, рисует
 * кухню, которую нельзя подключить.
 */
export const ServiceKind = z.enum(['socket', 'switch', 'water', 'drain', 'vent', 'gas']);

export const ServicePointSchema = z.object({
  id: z.string().uuid(),
  kind: ServiceKind,
  /** Точка в плане, миллиметры */
  position: Vec2Mm,
  /** Высота от пола: розетка над столешницей и розетка у пола — разное */
  heightMm: z.number().int().min(0).max(4000).default(300),
  /** Стена, к которой привязана точка. null — стоит сама по себе */
  wallId: z.string().uuid().nullable().default(null),
  note: z.string().max(200).default(''),
});

export const RoomSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(120).default('Комната'),
  walls: z.array(WallSchema).max(64),
  openings: z.array(OpeningSchema).max(64),
  floorMaterialId: z.string().nullable().default(null),
  ceilingMaterialId: z.string().nullable().default(null),
});

/** Выбранные опции конфигурации: код группы -> код опции. */
export const OptionSelectionSchema = z.record(z.string(), z.string());

/** Параметры для параметрических изделий: код -> значение в мм. */
export const ParamValuesSchema = z.record(z.string(), z.number().int());

export const PlacementSchema = z.object({
  instanceId: z.string().uuid(),
  productId: z.string().uuid(),
  sku: z.string(),
  position: Vec3Mm,
  /** Поворот вокруг вертикальной оси. Наклон мебели не поддерживаем осознанно. */
  rotationY: z.number().min(-360).max(360).default(0),
  options: OptionSelectionSchema.default({}),
  params: ParamValuesSchema.default({}),
  /**
   * Заказанные габариты, если изделие тянется.
   *
   * Хранится только то, что отличается от каталожного: пустой объект
   * означает «как в каталоге», а не «ноль». Мебель на заказ пилят под
   * место, и планировщик, который этого не умеет, показывает не ту
   * кухню, которую привезут.
   */
  size: z
    .object({
      widthMm: z.number().int().positive().optional(),
      heightMm: z.number().int().positive().optional(),
      depthMm: z.number().int().positive().optional(),
    })
    .default({}),
  /** Привязка к стене — для пересчёта при изменении планировки */
  anchoredToWallId: z.string().uuid().nullable().default(null),
  locked: z.boolean().default(false),
});

export const SceneDocSchema = z.object({
  version: z.literal(SCENE_DOC_VERSION),
  units: z.literal('mm'),
  rooms: z.array(RoomSchema).max(16),
  /** Инженерные точки помещения: розетки, вода, вентиляция */
  services: z.array(ServicePointSchema).max(200).default([]),
  placements: z.array(PlacementSchema).max(300),
  camera: z
    .object({
      mode: z.enum(['plan2d', 'orbit3d', 'firstPerson']).default('plan2d'),
      target: Vec3Mm.optional(),
      distance: z.number().int().optional(),
      azimuth: z.number().optional(),
      polar: z.number().optional(),
    })
    .default({ mode: 'plan2d' }),
  environment: z
    .object({
      preset: z.enum(['daylight', 'evening', 'studio']).default('daylight'),
      exposure: z.number().min(0.1).max(3).default(1),
    })
    .default({ preset: 'daylight', exposure: 1 }),
});

export type SceneDoc = z.infer<typeof SceneDocSchema>;
export type Placement = z.infer<typeof PlacementSchema>;
export type Wall = z.infer<typeof WallSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type ServicePoint = z.infer<typeof ServicePointSchema>;
export type ServicePointKind = z.infer<typeof ServiceKind>;

export function emptySceneDoc(): SceneDoc {
  return SceneDocSchema.parse({
    version: SCENE_DOC_VERSION,
    units: 'mm',
    rooms: [],
    placements: [],
  });
}
