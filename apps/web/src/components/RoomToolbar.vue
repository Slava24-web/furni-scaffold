<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  PhArrowArcLeft,
  PhArrowArcRight,
  PhArrowsOutSimple,
  PhDoorOpen,
  PhFrameCorners,
  PhLightning,
  PhScissors,
  PhSquaresFour,
  PhTrash,
  PhWall,
} from '@phosphor-icons/vue';
import { SERVICE_KINDS, type ServicePointKind } from '@furni/shared';
import type { PlannerMode } from '../composables/useSceneEditing';

/**
 * Командная строка планировщика.
 *
 * Раньше это была стена из пятнадцати одинаковых кнопок в три ряда:
 * «Прямоугольная комната» выглядела так же, как «Газ», и вместе они
 * съедали четверть экрана. Главное в планировщике — сцена, а не хром
 * вокруг неё.
 *
 * Теперь один ряд и три уровня важности: создание помещения слева
 * с единственной сплошной кнопкой, инструменты посередине сегментами,
 * просмотр и история справа. Виды инженерии показываются отдельной
 * полосой и только когда инструмент выбран: шесть кнопок, нужных раз
 * за проект, не должны висеть постоянно.
 */
const props = defineProps<{
  mode: PlannerMode;
  /** Какой вид инженерии ставится тапом */
  serviceKind: ServicePointKind;
  drawingActive: boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Есть ли что показывать в плане и раскрое */
  hasScene: boolean;
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
  pickService: [ServicePointKind];
}>();

const widthMm = ref(4000);
const depthMm = ref(3200);

const servicesOpen = computed(() => props.mode === 'add-service');

function createRoom(): void {
  emit('createRoom', { widthMm: widthMm.value, depthMm: depthMm.value });
}

/** Повторное нажатие на активный режим возвращает к выделению. */
function toggleMode(mode: PlannerMode): void {
  emit('setMode', props.mode === mode ? 'select' : mode);
}

/** Полоса инженерии открывается и закрывается тем же нажатием. */
function toggleServices(): void {
  emit('setMode', servicesOpen.value ? 'select' : 'add-service');
}
</script>

<template>
  <header class="bar">
    <div class="bar__row">
      <div class="room">
        <!-- Пара размеров одним полем: подпись «Ширина, мм» над каждым
             инпутом задирала строку вдвое ради двух слов, а знак
             умножения и «мм» и так говорят, что это габарит комнаты -->
        <div class="dims">
          <input
            v-model.number="widthMm"
            type="number"
            min="1000"
            max="20000"
            step="100"
            aria-label="Ширина комнаты, мм"
            title="Ширина комнаты, мм"
          />
          <span class="dims__times" aria-hidden="true">×</span>
          <input
            v-model.number="depthMm"
            type="number"
            min="1000"
            max="20000"
            step="100"
            aria-label="Глубина комнаты, мм"
            title="Глубина комнаты, мм"
          />
          <span class="dims__unit" aria-hidden="true">мм</span>
        </div>
        <button type="button" class="btn btn--primary" @click="createRoom">
          Создать комнату
        </button>
      </div>

      <span class="bar__divider" aria-hidden="true" />

      <div class="tools" role="group" aria-label="Инструменты планировки">
        <button
          type="button"
          class="tool"
          :class="{ 'tool--on': props.mode === 'draw-wall' }"
          :aria-pressed="props.mode === 'draw-wall'"
          @click="toggleMode('draw-wall')"
        >
          <PhWall :size="16" weight="regular" />
          Стены
        </button>
        <button
          type="button"
          class="tool"
          :class="{ 'tool--on': props.mode === 'add-door' }"
          :aria-pressed="props.mode === 'add-door'"
          @click="toggleMode('add-door')"
        >
          <PhDoorOpen :size="16" weight="regular" />
          Дверь
        </button>
        <button
          type="button"
          class="tool"
          :class="{ 'tool--on': props.mode === 'add-window' }"
          :aria-pressed="props.mode === 'add-window'"
          @click="toggleMode('add-window')"
        >
          <PhFrameCorners :size="16" weight="regular" />
          Окно
        </button>
        <button
          type="button"
          class="tool"
          :class="{ 'tool--on': servicesOpen }"
          :aria-pressed="servicesOpen"
          @click="toggleServices"
        >
          <PhLightning :size="16" weight="regular" />
          Инженерия
        </button>
      </div>

      <button
        v-if="props.drawingActive"
        type="button"
        class="btn btn--accentSoft"
        @click="emit('finishDrawing')"
      >
        Завершить контур
      </button>

      <div class="bar__end">
        <button
          type="button"
          class="btn"
          :disabled="!props.hasScene"
          @click="emit('showPlan')"
        >
          <PhSquaresFour :size="16" weight="regular" />
          План
        </button>
        <button
          type="button"
          class="btn"
          :disabled="!props.hasScene"
          @click="emit('showCut')"
        >
          <PhScissors :size="16" weight="regular" />
          Раскрой
        </button>

        <span class="bar__divider" aria-hidden="true" />

        <button
          type="button"
          class="icon"
          title="Отменить"
          aria-label="Отменить"
          :disabled="!props.canUndo"
          @click="emit('undo')"
        >
          <PhArrowArcLeft :size="17" weight="regular" />
        </button>
        <button
          type="button"
          class="icon"
          title="Повторить"
          aria-label="Повторить"
          :disabled="!props.canRedo"
          @click="emit('redo')"
        >
          <PhArrowArcRight :size="17" weight="regular" />
        </button>
        <button
          type="button"
          class="icon icon--danger"
          title="Убрать планировку"
          aria-label="Убрать планировку"
          :disabled="!props.hasScene"
          @click="emit('clearRooms')"
        >
          <PhTrash :size="17" weight="regular" />
        </button>
      </div>
    </div>

    <!-- Виды инженерии живут в своей полосе: они нужны только внутри
         режима разметки, а постоянно висящие шесть кнопок были шумом -->
    <div v-if="servicesOpen" class="services">
      <PhArrowsOutSimple :size="14" weight="regular" class="services__icon" />
      <span class="services__hint">Тапните по стене, метку ставит выбранный вид</span>
      <div class="services__list">
        <button
          v-for="service in SERVICE_KINDS"
          :key="service.kind"
          type="button"
          class="chip"
          :class="{ 'chip--on': props.serviceKind === service.kind }"
          :aria-pressed="props.serviceKind === service.kind"
          @click="emit('pickService', service.kind)"
        >
          {{ service.name }}
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.bar {
  flex: none;
  border-bottom: 1px solid var(--c-line);
  background: var(--c-bg);
}

.bar__row {
  display: flex;
  align-items: center;
  gap: var(--gap-3);
  height: 56px;
  padding: 0 var(--gap-4);
}

.bar__divider {
  width: 1px;
  height: 22px;
  flex: none;
  background: var(--c-line);
}

.bar__end {
  display: flex;
  align-items: center;
  gap: var(--gap-2);
  margin-left: auto;
}

/* --- Размеры помещения --- */
.room {
  display: flex;
  align-items: center;
  gap: var(--gap-2);
}

/* Габарит комнаты как одно поле: рамка общая, внутри два числа */
.dims {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 9px 0 4px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  background: var(--c-bg);
  transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease);
}

.dims:hover {
  border-color: var(--c-text-faint);
}

.dims:focus-within {
  border-color: var(--c-accent);
  box-shadow: 0 0 0 3px var(--c-accent-soft);
}

.dims__times,
.dims__unit {
  flex: none;
  color: var(--c-text-faint);
  font-size: var(--t-sm);
}

.dims input[type='number'] {
  width: 58px;
  padding: 7px 4px;
  border: 0;
  background: none;
  font: inherit;
  font-size: var(--t-md);
  color: var(--c-text);
  text-align: center;
}

.dims input[type='number']:focus {
  outline: none;
}

/* Кнопки-стрелки съедают половину узкого поля и в планировщике не нужны:
   размер набирают с клавиатуры */
.dims input[type='number']::-webkit-outer-spin-button,
.dims input[type='number']::-webkit-inner-spin-button {
  appearance: none;
  margin: 0;
}

.dims input[type='number'] {
  appearance: textfield;
  -moz-appearance: textfield;
}

/* --- Кнопки --- */
.btn,
.tool,
.icon,
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: var(--r-sm);
  background: transparent;
  font: inherit;
  font-size: var(--t-md);
  color: var(--c-text);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.13s var(--ease), border-color 0.13s var(--ease),
    color 0.13s var(--ease), transform 0.08s var(--ease);
}

.btn {
  padding: 7px 11px;
  border-color: var(--c-line-strong);
  background: var(--c-bg);
}

.btn:hover:not(:disabled) {
  border-color: var(--c-text-faint);
  background: var(--c-bg-hover);
}

/* Нажатие отзывается: без этого кнопка ощущается картинкой */
.btn:active:not(:disabled),
.tool:active,
.icon:active:not(:disabled),
.chip:active {
  transform: translateY(1px);
}

.btn:disabled,
.icon:disabled {
  opacity: 0.4;
  cursor: default;
}

/* Единственная сплошная кнопка в строке: создание помещения — то,
   с чего начинается работа, и глаз обязан находить её первой */
.btn--primary {
  border-color: var(--c-accent);
  background: var(--c-accent);
  color: #fff;
  font-weight: 500;
  box-shadow: var(--sh-sm);
}

.btn--primary:hover:not(:disabled) {
  border-color: var(--c-accent-hover);
  background: var(--c-accent-hover);
}

.btn--accentSoft {
  border-color: var(--c-accent-line);
  background: var(--c-accent-soft);
  color: var(--c-accent-hover);
  font-weight: 500;
}

/* --- Сегменты инструментов --- */
.tools {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: var(--r-md);
  background: var(--c-bg-sunken);
}

.tool {
  padding: 6px 10px;
  border-radius: var(--r-sm);
  color: var(--c-text-muted);
}

.tool:hover {
  background: var(--c-bg-active);
  color: var(--c-text);
}

.tool--on {
  background: var(--c-bg);
  color: var(--c-accent);
  box-shadow: var(--sh-sm);
}

.tool--on:hover {
  background: var(--c-bg);
}

/* --- Иконные кнопки --- */
.icon {
  width: 32px;
  height: 32px;
  justify-content: center;
  color: var(--c-text-muted);
}

.icon:hover:not(:disabled) {
  background: var(--c-bg-hover);
  color: var(--c-text);
}

.icon--danger:hover:not(:disabled) {
  background: var(--c-danger-soft);
  color: var(--c-danger);
}

/* --- Полоса инженерии --- */
.services {
  display: flex;
  align-items: center;
  gap: var(--gap-2);
  padding: 8px var(--gap-4);
  border-top: 1px solid var(--c-line);
  background: var(--c-accent-soft);
}

.services__icon {
  color: var(--c-accent);
  flex: none;
}

.services__hint {
  font-size: var(--t-sm);
  color: var(--c-text-muted);
}

.services__list {
  display: flex;
  gap: var(--gap-1);
  margin-left: auto;
  flex-wrap: wrap;
}

.chip {
  padding: 5px 11px;
  border-radius: var(--r-pill);
  border-color: var(--c-accent-line);
  background: var(--c-bg);
  font-size: var(--t-sm);
  color: var(--c-text-muted);
}

.chip:hover {
  border-color: var(--c-accent);
  color: var(--c-text);
}

.chip--on {
  border-color: var(--c-accent);
  background: var(--c-accent);
  color: #fff;
}

/* Узкий экран: строка распадается, но порядок важности сохраняется */
@media (max-width: 900px) {
  .bar__row {
    height: auto;
    flex-wrap: wrap;
    padding: var(--gap-2) var(--gap-3);
  }

  .bar__end {
    margin-left: 0;
  }

  .dims input[type='number'] {
    width: 54px;
  }
}
</style>
