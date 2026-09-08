import type { Viewer } from '@furni/viewer';
import type { CatalogProduct } from '@furni/shared';
import { useCatalogStore } from '../stores/catalog';
import { useSceneStore } from '../stores/scene';

/**
 * Мост для перф-гейта и ручной отладки: `window.__furni`.
 *
 * Ставится только в dev-сборке или по `?perf=1`. Интерфейс зафиксирован
 * тестами в `tests/perf/budget.spec.ts`.
 *
 * Фикстура наполняет ДОКУМЕНТ сцены, а не реестр вьюера напрямую: так
 * перф-гейт меряет тот же путь, которым объекты попадают в сцену у
 * пользователя — разбор каталога, загрузка моделей, синхронизация.
 */

export interface FurniTestingApi {
  readonly viewer: Viewer | null;
  readonly firstFrameAt: number | null;
  readonly testing: {
    seedScene(count: number): Promise<void>;
    clearScene(): Promise<void>;
  };
}

declare global {
  interface Window {
    __furni?: FurniTestingApi;
  }
}

/** Шаг сетки расстановки: с запасом больше самой широкой модели. */
const GRID_STEP_MM = 2600;

export function installTestingApi(getViewer: () => Viewer | null): void {
  const scene = useSceneStore();
  const catalog = useCatalogStore();

  async function seedScene(count: number): Promise<void> {
    await catalog.load();
    const products = catalog.products.filter((p) => p.snapToWall && p.mountHeightMm === 0);
    if (products.length === 0) {
      throw new Error(
        'Каталог тестового тенанта пуст. Сгенерируйте модели: pnpm models:test',
      );
    }

    clearScene();

    const columns = Math.ceil(Math.sqrt(count));
    const offset = ((columns - 1) * GRID_STEP_MM) / 2;

    for (let index = 0; index < count; index++) {
      const product = products[index % products.length] as CatalogProduct;
      scene.addPlacement(product, {
        x: (index % columns) * GRID_STEP_MM - offset,
        z: Math.floor(index / columns) * GRID_STEP_MM - offset,
      });
    }

    await waitForInstances(getViewer, count);
  }

  function clearScene(): void {
    for (const placement of [...scene.doc.placements]) {
      scene.removePlacement(placement.instanceId);
    }
  }

  const api: FurniTestingApi = {
    get viewer() {
      return getViewer();
    },
    get firstFrameAt() {
      return getViewer()?.firstFrameAt ?? null;
    },
    testing: {
      seedScene,
      async clearScene() {
        clearScene();
      },
    },
  };

  window.__furni = api;
}

export function uninstallTestingApi(): void {
  delete window.__furni;
}

/**
 * Модели грузятся асинхронно, а тест сразу после засева снимает метрики.
 * Без ожидания он померил бы пустую сцену.
 */
async function waitForInstances(
  getViewer: () => Viewer | null,
  expected: number,
  timeoutMs = 20_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const viewer = getViewer();
    if (viewer && [...viewer.registry.all()].length >= expected) return;
    if (performance.now() > deadline) {
      throw new Error(`Засев не завершился: ожидалось ${expected} объектов`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
