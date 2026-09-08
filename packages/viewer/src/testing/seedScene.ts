import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Viewer } from '../core/Viewer';

/**
 * Фикстура сцены для перф-гейта и локальной отладки (BACKLOG, фаза 0).
 *
 * Это ЗАГЛУШКА до прогона пайплайна на реальных моделях: примитивы вместо
 * GLB. Она проверяет цикл рендера, бюджет draw calls и адаптивное качество,
 * но не нагрузку от реальной геометрии и текстур. Заменить на реальные
 * ассеты сразу, как только пайплайн отработает на моделях клиента.
 *
 * Модуль не экспортируется из `index.ts` намеренно: подключается только
 * динамическим импортом под флагом, чтобы не попасть в прод-бандл.
 */

const FIXTURE_PREFIX = 'fixture:';

/** Габариты в миллиметрах — единицы системы (CLAUDE.md). */
interface ItemSpec {
  readonly kind: string;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  /** Индексы материалов: корпус, фасад, цоколь */
  readonly materials: readonly [number, number, number];
}

const CATALOG: readonly ItemSpec[] = [
  { kind: 'wardrobe', width: 900, height: 2000, depth: 600, materials: [0, 1, 3] },
  { kind: 'sideboard', width: 1200, height: 750, depth: 450, materials: [1, 2, 3] },
  { kind: 'table', width: 1400, height: 750, depth: 800, materials: [2, 2, 3] },
  { kind: 'chair', width: 450, height: 900, depth: 480, materials: [3, 0, 3] },
  { kind: 'sofa', width: 1800, height: 850, depth: 900, materials: [4, 4, 3] },
];

const MATERIAL_COLORS = [0xd9cfc1, 0xa8b2bd, 0x8f7a63, 0x4a4a4f, 0x9aa89c] as const;

/**
 * Общий пул материалов: 5 штук на всю сцену вместо одного на объект.
 * Бюджет mid — 25 уникальных материалов, каждый лишний это переключение
 * состояния GPU. Помечены shared: их не должен освобождать SceneRegistry.
 */
function createMaterials(): MeshStandardMaterial[] {
  return MATERIAL_COLORS.map((color) => {
    const material = new MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.02 });
    material.userData.shared = true;
    return material;
  });
}

let sharedMaterials: MeshStandardMaterial[] | null = null;

function materials(): MeshStandardMaterial[] {
  sharedMaterials ??= createMaterials();
  return sharedMaterials;
}

function part(
  widthMm: number,
  heightMm: number,
  depthMm: number,
  material: MeshStandardMaterial,
): Mesh {
  // Геометрия своя на каждую деталь: её владелец — инстанс, и registry
  // обязан освободить её при удалении объекта.
  const geometry = new BoxGeometry(widthMm / 1000, heightMm / 1000, depthMm / 1000);
  return new Mesh(geometry, material);
}

/**
 * Три меша на предмет: корпус, фасад, цоколь. 20 предметов = 60 draw calls
 * при бюджете mid в 80 — фикстура должна быть на границе, а не бесплатной.
 */
function buildItem(spec: ItemSpec): Group {
  const pool = materials();
  const pick = (i: number): MeshStandardMaterial => pool[i % pool.length]!;
  const group = new Group();

  const plinth = 80;
  const facadeDepth = 18;

  const body = part(spec.width, spec.height - plinth, spec.depth, pick(spec.materials[0]));
  body.position.y = (spec.height - plinth) / 2000 + plinth / 1000;

  const facade = part(spec.width - 40, spec.height - plinth - 120, facadeDepth, pick(spec.materials[1]));
  facade.position.set(0, body.position.y, (spec.depth + facadeDepth) / 2000);

  const base = part(spec.width - 60, plinth, spec.depth - 60, pick(spec.materials[2]));
  base.position.y = plinth / 2000;

  group.add(body, facade, base);
  // Origin модели — низ-центр габарита (CLAUDE.md, конвенции)
  group.name = spec.kind;
  return group;
}

/** Удаляет ранее засеянные объекты, не трогая настоящие. */
export function clearSeededScene(viewer: Viewer): void {
  const seeded = [...viewer.registry.all()].filter((i) => i.productId.startsWith(FIXTURE_PREFIX));
  for (const instance of seeded) viewer.registry.remove(instance.instanceId);
  viewer.invalidate();
}

/**
 * Расставляет `count` предметов сеткой вокруг начала координат.
 * Идемпотентна: повторный вызов пересобирает сцену с нуля.
 */
export function seedScene(viewer: Viewer, count: number): void {
  clearSeededScene(viewer);

  const columns = Math.ceil(Math.sqrt(count));
  const stepM = 1.6;
  const offset = ((columns - 1) * stepM) / 2;

  for (let i = 0; i < count; i++) {
    const spec = CATALOG[i % CATALOG.length]!;
    const group = buildItem(spec);
    group.position.set((i % columns) * stepM - offset, 0, Math.floor(i / columns) * stepM - offset);
    group.rotation.y = ((i % 4) * Math.PI) / 2;
    viewer.registry.add(`${FIXTURE_PREFIX}${i}`, `${FIXTURE_PREFIX}${spec.kind}`, group);
  }

  viewer.invalidate();
}
