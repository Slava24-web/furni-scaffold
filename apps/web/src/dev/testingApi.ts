import type { Viewer } from '@furni/viewer';

/**
 * Мост для перф-гейта и ручной отладки: `window.__furni`.
 *
 * Ставится только в dev-сборке или по `?perf=1`. Модуль с фикстурами
 * подгружается динамически, поэтому в прод-бандл не попадает.
 * Интерфейс зафиксирован тестами в `tests/perf/budget.spec.ts`.
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

export function installTestingApi(getViewer: () => Viewer | null): void {
  const api: FurniTestingApi = {
    get viewer() {
      return getViewer();
    },
    get firstFrameAt() {
      return getViewer()?.firstFrameAt ?? null;
    },
    testing: {
      async seedScene(count: number): Promise<void> {
        const viewer = requireViewer(getViewer());
        const { seedScene } = await import('@furni/viewer/testing');
        seedScene(viewer, count);
      },
      async clearScene(): Promise<void> {
        const viewer = requireViewer(getViewer());
        const { clearSeededScene } = await import('@furni/viewer/testing');
        clearSeededScene(viewer);
      },
    },
  };

  window.__furni = api;
}

export function uninstallTestingApi(): void {
  delete window.__furni;
}

function requireViewer(viewer: Viewer | null): Viewer {
  if (!viewer) throw new Error('Viewer ещё не смонтирован');
  return viewer;
}
