<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { MAX_ROOM_SIDE_MM, MIN_ROOM_SIDE_MM } from '@furni/shared';

/**
 * Ввод размера помещения по размерной линии.
 *
 * Всплывает у той подписи, по которой тапнули, и стоит на месте: поле
 * привязано к точке тапа, а не к подписи в сцене — иначе оно уезжало бы
 * вместе с камерой, пока пользователь набирает число.
 */
const props = defineProps<{
  valueMm: number;
  /** Положение относительно области сцены, пиксели */
  x: number;
  y: number;
}>();

const emit = defineEmits<{ apply: [number]; cancel: [] }>();

const value = ref(props.valueMm);
const input = ref<HTMLInputElement | null>(null);

onMounted(async () => {
  await nextTick();
  // Значение выделяется целиком: пользователь набирает новый размер,
  // а не дописывает цифры к старому
  input.value?.focus();
  input.value?.select();
});

const valid = (): boolean =>
  Number.isFinite(value.value) &&
  value.value >= MIN_ROOM_SIDE_MM &&
  value.value <= MAX_ROOM_SIDE_MM;

function apply(): void {
  if (!valid()) return;
  emit('apply', Math.round(value.value));
}
</script>

<template>
  <div class="dimension" :style="{ left: `${props.x}px`, top: `${props.y}px` }">
    <input
      ref="input"
      v-model.number="value"
      type="number"
      :min="MIN_ROOM_SIDE_MM"
      :max="MAX_ROOM_SIDE_MM"
      step="10"
      aria-label="Размер помещения, мм"
      @keydown.enter.prevent="apply"
      @keydown.esc.prevent="emit('cancel')"
    />
    <span class="dimension__units">мм</span>
    <button type="button" :disabled="!valid()" title="Применить" @click="apply">✓</button>
  </div>
</template>

<style scoped>
.dimension {
  position: absolute;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 4px;
  /* Поле встаёт над точкой тапа, чтобы не закрывать саму размерную линию */
  transform: translate(-50%, -130%);
  padding: 3px 4px 3px 6px;
  border: 1px solid #2f6fed;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 6px 16px rgb(16 24 40 / 0.16);
}
input {
  width: 62px;
  padding: 2px 4px;
  border: 1px solid #d5d8dd;
  border-radius: 5px;
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.dimension__units {
  font-size: 10px;
  color: #6b7280;
}
button {
  padding: 3px 6px;
  border: 1px solid #2f6fed;
  border-radius: 5px;
  background: #2f6fed;
  color: #fff;
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
}
button:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
