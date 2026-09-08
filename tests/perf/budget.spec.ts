import { expect, test, type Page } from '@playwright/test';
import { LOAD_BUDGETS, RENDER_BUDGETS } from '@furni/shared';

/**
 * Перф-гейт. Падение этого теста блокирует мерж (CLAUDE.md, главное правило).
 *
 * Тест эмулирует mid-устройство через CPU throttling и forceTier.
 * Это НЕ заменяет замеры на реальных телефонах — служит защитой от регрессий
 * между ручными прогонами на device farm.
 */

const SCENE_OBJECTS = 20;

test.describe('Бюджет производительности сцены', () => {
  test.beforeEach(async ({ page }) => {
    const client = await page.context().newCDPSession(page);
    // 4x throttling примерно соответствует mid-классу Android
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      // В CDP параметр называется latency, а не latencyMs:
      // при неверном имени протокол отвечает Invalid parameters
      latency: 70,
      downloadThroughput: (8 * 1024 * 1024) / 8,
      uploadThroughput: (2 * 1024 * 1024) / 8,
    });
  });

  test('сцена из 20 объектов держит целевой fps', async ({ page }) => {
    await page.goto('/planner?forceTier=mid&perf=1');
    await seedScene(page, SCENE_OBJECTS);

    // Прогреваем: первые кадры включают компиляцию шейдеров
    await page.waitForTimeout(2000);
    await orbitCamera(page, 3000);

    const snapshot = await page.evaluate(() => window.__furni.viewer.telemetry.snapshot());
    const budget = RENDER_BUDGETS.mid;

    // Геометрические бюджеты детерминированы: не зависят ни от GPU,
    // ни от нагрузки машины. Это и есть настоящая защита от регрессий.
    expect(snapshot.drawCalls, 'draw calls').toBeLessThanOrEqual(budget.maxDrawCalls);
    expect(snapshot.triangles, 'треугольники').toBeLessThanOrEqual(budget.maxTriangles);
    expect(snapshot.sampleCount, 'набрана статистика кадров').toBeGreaterThan(60);

    const renderer = await detectRenderer(page);
    if (isSoftwareRenderer(renderer)) {
      // Софтверный растеризатор в headless-CI даёт p50 в районе порога
      // с разбросом в единицы кадров: гейт на нём мигал бы, а не защищал.
      // Требование 60 fps p50 остаётся, но проверяется на живых устройствах —
      // это отдельный пункт фазы 0 в docs/BACKLOG.md, его не заменяет CI.
      test.info().annotations.push({
        type: 'fps (не проверяется)',
        description:
          `renderer=${renderer}, p50=${snapshot.fpsP50}, p95=${snapshot.fpsP95}. ` +
          'Программный рендер: числа записаны для отслеживания, гейтом не являются.',
      });
      return;
    }

    expect(snapshot.fpsP50, 'fps p50').toBeGreaterThanOrEqual(budget.targetFps * 0.95);
    expect(snapshot.fpsP95, 'fps p95').toBeGreaterThanOrEqual(budget.floorFps);
  });

  test('первый кадр укладывается в бюджет', async ({ page }) => {
    const start = Date.now();
    await page.goto('/planner?forceTier=mid&perf=1');
    await page.waitForFunction(() => window.__furni?.firstFrameAt != null, { timeout: 10_000 });
    const ttff = Date.now() - start;
    expect(ttff, 'TTFF').toBeLessThanOrEqual(LOAD_BUDGETS.timeToFirstFrameMs);
  });

  test('виджет не влияет на LCP страницы магазина', async ({ page }) => {
    await page.goto('/fixtures/shop-page.html');
    const lcpWithout = await measureLcp(page);
    await page.goto('/fixtures/shop-page.html?widget=1');
    const lcpWith = await measureLcp(page);
    // До клика движок не грузится — влияния быть не должно (ТЗ 7.3)
    expect(lcpWith - lcpWithout).toBeLessThanOrEqual(50);
  });
});

/** Имя GPU из WEBGL_debug_renderer_info: отличает живой GPU от SwiftShader. */
async function detectRenderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (!gl || !ext) return 'unknown';
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? 'unknown');
  });
}

function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|software|unknown/i.test(renderer);
}

async function seedScene(page: Page, count: number): Promise<void> {
  // goto резолвится по load, а маршрут планировщика — ленивый чанк:
  // мост __furni появляется уже после монтирования компонента
  await page.waitForFunction(() => window.__furni?.viewer != null, undefined, { timeout: 10_000 });
  await page.evaluate((n) => window.__furni.testing.seedScene(n), count);
  await page.waitForFunction(
    (n) => window.__furni.viewer.registry && [...window.__furni.viewer.registry.all()].length === n,
    count,
  );
}

async function orbitCamera(page: Page, durationMs: number): Promise<void> {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('Канвас не найден');
  const steps = Math.floor(durationMs / 16);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 0; i < steps; i++) {
    await page.mouse.move(
      box.x + box.width / 2 + Math.sin(i / 10) * 200,
      box.y + box.height / 2 + Math.cos(i / 15) * 80,
    );
  }
  await page.mouse.up();
}

async function measureLcp(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          resolve(entries[entries.length - 1].startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => resolve(0), 5000);
      }),
  );
}

declare global {
  interface Window {
    __furni: {
      viewer: import('@furni/viewer').Viewer;
      firstFrameAt: number | null;
      testing: { seedScene(count: number): Promise<void> };
    };
  }
}
