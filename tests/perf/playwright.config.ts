import { defineConfig, devices } from '@playwright/test';

/**
 * Конфиг перф-гейта. Прогоняется в CI на каждый PR и блокирует мерж
 * при выходе за бюджеты (CLAUDE.md, главное правило).
 *
 * Сервер поднимается на собранном бандле, а не на dev-сервере: замерять
 * TTFF на несобранном Vite бессмысленно — он отдаёт модули по одному.
 */
export default defineConfig({
  testDir: '.',
  // Перф-замеры нельзя гонять параллельно: соседний воркер отъедает CPU
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  reporter: [
    ['list'],
    ['json', { outputFile: 'results/report.json' }],
  ],
  outputDir: 'results/artifacts',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: {
      // Софтверный растеризатор даёт стабильные, воспроизводимые кадры
      // в headless-CI, где нет настоящего GPU
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'pnpm --filter web exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/planner',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    cwd: '../..',
  },
});
