<script setup lang="ts">
import { ref } from 'vue';
import {
  KITCHEN_LAYOUTS,
  SERVICE_KINDS,
  type KitchenLayoutKind,
  type ServicePointKind,
} from '@furni/shared';
import type { PlannerMode } from '../composables/useSceneEditing';

const props = defineProps<{
  mode: PlannerMode;
  /** Какой вид инженерии ставится тапом */
  serviceKind: ServicePointKind;
  drawingActive: boolean;
  canUndo: boolean;
  canRedo: boolean;
}>();

const emit = defineEmits<{
  createRoom: [{ widthMm: number; depthMm: number }];
  setMode: [PlannerMode];
  finishDrawing: [];
  clearRooms: [];
  undo: [];
  redo: [];
  showCut: [];
  showPlan: [];
  buildKitchen: [KitchenLayoutKind];
  pickService: [ServicePointKind];
}>();

const widthMm = ref(4000);
const depthMm = ref(3200);

function createRoom(): void {
  emit('createRoom', { widthMm: widthMm.value, depthMm: depthMm.value });
}

/** Повторное нажатие на активный режим возвращает к выделению. */
function toggleMode(mode: PlannerMode): void {
  emit('setMode', props.mode === mode ? 'select' : mode);
}
</script>

<template>
  <div class="toolbar">
    <div class="toolbar__group">
      <label class="field">
        Ширина, мм
        <input v-model.number="widthMm" type="number" min="1000" max="20000" step="100" />
      </label>
      <label class="field">
        Глубина, мм
        <input v-model.number="depthMm" type="number" min="1000" max="20000" step="100" />
      </label>
      <button type="button" @click="createRoom">Прямоугольная комната</button>
    </div>

    <div class="toolbar__group">
      <button
        type="button"
        :class="{ 'is-active': props.mode === 'draw-wall' }"
        @click="toggleMode('draw-wall')"
      >
        Рисовать стены
      </button>
      <button v-if="props.drawingActive" type="button" @click="emit('finishDrawing')">
        Завершить контур
      </button>
      <button
        type="button"
        :class="{ 'is-active': props.mode === 'add-door' }"
        @click="toggleMode('add-door')"
      >
        Дверь
      </button>
      <button
        type="button"
        :class="{ 'is-active': props.mode === 'add-window' }"
        @click="toggleMode('add-window')"
      >
        Окно
      </button>
      <button type="button" @click="emit('clearRooms')">Убрать планировку</button>
      <button type="button" @click="emit('showPlan')">План</button>
      <button type="button" @click="emit('showCut')">Раскрой</button>
    </div>

    <div class="toolbar__group">
      <span class="toolbar__label">Инженерия</span>
      <button
        v-for="service in SERVICE_KINDS"
        :key="service.kind"
        type="button"
        :class="{ 'is-active': props.mode === 'add-service' && props.serviceKind === service.kind }"
        @click="emit('pickService', service.kind)"
      >
        {{ service.name }}
      </button>
    </div>

    <div class="toolbar__group">
      <span class="toolbar__label">Собрать кухню</span>
      <button
        v-for="layout in KITCHEN_LAYOUTS"
        :key="layout.kind"
        type="button"
        :title="layout.description"
        @click="emit('buildKitchen', layout.kind)"
      >
        {{ layout.name }}
      </button>
    </div>

    <div class="toolbar__group toolbar__group--end">
      <button type="button" :disabled="!props.canUndo" @click="emit('undo')">Отменить</button>
      <button type="button" :disabled="!props.canRedo" @click="emit('redo')">Повторить</button>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-end;
  padding: 10px 14px;
  border-bottom: 1px solid #e3e5e8;
  background: #fff;
}
.toolbar__group {
  display: flex;
  gap: 6px;
  align-items: flex-end;
}
.toolbar__group--end {
  margin-left: auto;
}
.toolbar__label {
  align-self: center;
  font-size: 11px;
  color: #6b7280;
}
.field {
  display: grid;
  gap: 3px;
  font-size: 11px;
  color: #6b7280;
}
input {
  width: 92px;
  padding: 5px 7px;
  border: 1px solid #d5d8dd;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
button {
  padding: 6px 11px;
  border: 1px solid #d5d8dd;
  border-radius: 6px;
  background: #fff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
button:hover:not(:disabled) {
  border-color: #b6c2d4;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
button.is-active {
  background: #2f6fed;
  border-color: #2f6fed;
  color: #fff;
}
</style>
