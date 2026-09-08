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
      latencyMs: 70,
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

    expect(snapshot.fpsP50, 'fps p50').toBeGreaterThanOrEqual(budget.targetFps * 0.95);
    expect(snapshot.fpsP95, 'fps p95').toBeGreaterThanOrEqual(budget.floorFps);
    expect(snapshot.drawCalls, 'draw calls').toBeLessThanOrEqual(budget.maxDrawCalls);
    expect(snapshot.triangles, 'треугольники').toBeLessThanOrEqual(budget.maxTriangles);
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

async function seedScene(page: Page, count: number): Promise<void> {
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
      testing: { seedScene(count: number): void };
    };
  }
}
