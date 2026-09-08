import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
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
