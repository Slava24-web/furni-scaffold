import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      // Локальные пакеты подключаются исходниками, а не собранным dist:
      // иначе правка в shared требовала бы пересборки перед каждым HMR.
      // На сборку это не влияет — Vite всё равно компилирует их сам.
      '@furni/shared': fromRoot('../../packages/shared/src/index.ts'),
      '@furni/viewer/testing': fromRoot('../../packages/viewer/src/testing/seedScene.ts'),
      '@furni/viewer': fromRoot('../../packages/viewer/src/index.ts'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Движок выносится в отдельный ленивый чанк: бюджет 500 КБ gzip.
          // Без этого three попадёт в основной бандл и убьёт TTFF.
          if (id.includes('three') || id.includes('packages/viewer')) return 'engine';
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
  // Бюджет проверяется size-limit в CI, здесь только предупреждение
  esbuild: { legalComments: 'none' },
});
