<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useViewer } from '../composables/useViewer';
import { useSceneEditing } from '../composables/useSceneEditing';
import { useSceneStore } from '../stores/scene';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const store = useSceneStore();

const { viewer, telemetry, mount } = useViewer(canvasRef);
const { selectedId, isSnapping, attach, detach } = useSceneEditing(viewer, {
  onCommit: (id, patch) => store.updatePlacement(id, patch),
});

onMounted(() => {
  mount();
  if (containerRef.value) attach(containerRef.value);
});

defineExpose({ viewer, detach });
</script>

<template>
  <div ref="containerRef" class="scene-canvas" :class="{ 'is-snapping': isSnapping }">
    <canvas ref="canvasRef" />
    <!-- Оверлей отладки. Виден только при VITE_SHOW_PERF=1 -->
    <div v-if="telemetry && $env.showPerf" class="perf-overlay">
      {{ telemetry.fpsP50 }} fps · {{ telemetry.drawCalls }} dc ·
      {{ Math.round(telemetry.triangles / 1000) }}k tri
    </div>
    <slot :selected-id="selectedId" />
  </div>
</template>

<style scoped>
.scene-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  /* Обязательно: иначе iOS Safari перехватывает жесты под зум страницы */
  touch-action: none;
  overscroll-behavior: none;
}
canvas { display: block; width: 100%; height: 100%; }
.perf-overlay {
  position: absolute; top: 8px; left: 8px;
  padding: 4px 8px; border-radius: 6px;
  font: 500 11px/1.4 ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  background: rgb(0 0 0 / 0.6); color: #fff;
  pointer-events: none;
}
</style>
