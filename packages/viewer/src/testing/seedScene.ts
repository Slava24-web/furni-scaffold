import type { Group } from 'three';
import type { Viewer } from '../core/Viewer';
import type { AssetRef } from '../loading/AssetLoader';

/**
 * Фикстура сцены для перф-гейта и локальной отладки (BACKLOG, фаза 0).
 *
 * Собирает сцену из НАСТОЯЩИХ моделей демо-тенанта `test`, прошедших
 * пайплайн: GLB со сжатием meshopt, WebP-текстурами и тремя уровнями LOD.
 * Раньше здесь были примитивы, и зелёный перф-гейт ничего не доказывал.
 *
 * Модуль не экспортируется из `index.ts` намеренно: подключается только
 * динамическим импортом под флагом, чтобы не попасть в прод-бандл.
 */

const FIXTURE_PREFIX = 'fixture:';
const CATALOG_URL = '/assets/test/catalog.json';

/** Шаг сетки расстановки: с запасом больше самой широкой модели (диван 2040 мм). */
const GRID_STEP_M = 2.6;

interface CatalogProduct {
  sku: string;
  name: string;
  urlTemplate: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
}

interface Catalog {
  products: CatalogProduct[];
}

let catalogCache: Promise<Catalog> | null = null;

async function loadCatalog(): Promise<Catalog> {
  catalogCache ??= fetch(CATALOG_URL).then(async (response) => {
    if (!response.ok) {
      throw new Error(
        `Каталог тестового тенанта не отдан (${response.status}). ` +
          'Сгенерируйте модели: pnpm --filter @furni/pipeline models:test',
      );
    }
    return (await response.json()) as Catalog;
  });
  return catalogCache;
}

/** Удаляет ранее засеянные объекты, не трогая настоящие. */
export function clearSeededScene(viewer: Viewer): void {
  const seeded = [...viewer.registry.all()].filter((i) => i.productId.startsWith(FIXTURE_PREFIX));
  for (const instance of seeded) viewer.registry.remove(instance.instanceId);
  viewer.invalidate();
}

/**
 * Расставляет `count` предметов сеткой вокруг начала координат.
 *
 * Загрузка идёт параллельно, но кэш загрузчика на каждый SKU один:
 * пять моделей на любое число объектов, остальное — клоны с общей
 * геометрией. Иначе двадцать объектов означали бы двадцать скачиваний.
 */
export async function seedScene(viewer: Viewer, count: number): Promise<void> {
  clearSeededScene(viewer);

  const { products } = await loadCatalog();
  if (products.length === 0) throw new Error('Каталог тестового тенанта пуст');

  const columns = Math.ceil(Math.sqrt(count));
  const offset = ((columns - 1) * GRID_STEP_M) / 2;

  const placements = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const product = products[index % products.length]!;
      const ref: AssetRef = { productId: product.sku, urlTemplate: product.urlTemplate };
      const group = await viewer.assets.load(ref, 0);
      return { index, product, group };
    }),
  );

  for (const { index, product, group } of placements) {
    position(group, index, columns, offset);
    viewer.registry.add(`${FIXTURE_PREFIX}${index}`, `${FIXTURE_PREFIX}${product.sku}`, group);
  }

  viewer.invalidate();
}

function position(group: Group, index: number, columns: number, offset: number): void {
  group.position.set(
    (index % columns) * GRID_STEP_M - offset,
    0,
    Math.floor(index / columns) * GRID_STEP_M - offset,
  );
  // Разворот по четвертям: сцена из одинаково ориентированных объектов
  // не нагружает отсечение по пирамиде видимости так, как реальная
  group.rotation.y = ((index % 4) * Math.PI) / 2;
}
