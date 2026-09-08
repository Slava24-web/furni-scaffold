<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import SceneCanvas from '../components/SceneCanvas.vue';
import { installTestingApi, uninstallTestingApi } from '../dev/testingApi';
import type { DeviceTier } from '@furni/shared';

const route = useRoute();
const canvas = ref<InstanceType<typeof SceneCanvas> | null>(null);

const TIERS: readonly DeviceTier[] = ['low', 'mid', 'high', 'desktop'];

/** Перф-гейт открывает /planner?forceTier=mid&perf=1 — тир задаётся из адреса. */
const forceTier = computed<DeviceTier | undefined>(() => {
  const raw = route.query.forceTier;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return TIERS.find((t) => t === value);
});

const testingEnabled = computed(() => import.meta.env.DEV || route.query.perf === '1');

onMounted(() => {
  if (!testingEnabled.value) return;
  installTestingApi(() => canvas.value?.viewer ?? null);
});

onBeforeUnmount(() => uninstallTestingApi());
</script>

<template>
  <main class="planner">
    <SceneCanvas ref="canvas" :force-tier="forceTier" />
  </main>
</template>

<style scoped>
.planner {
  position: relative;
  height: 100%;
  width: 100%;
}
</style>
