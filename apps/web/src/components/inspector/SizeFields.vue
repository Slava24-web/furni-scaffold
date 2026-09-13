<script setup lang="ts">
import { computed } from 'vue';
import { axisLimits, placementSize, type CatalogProduct, type Placement } from '@furni/shared';
import NumberField from './NumberField.vue';

/**
 * Заказ нестандартного габарита.
 *
 * Показывается только там, где изделие тянется: у техники габарит
 * стандартный, и поле ввода обещало бы невозможное.
 */
const props = defineProps<{ placement: Placement; product: CatalogProduct }>();
const emit = defineEmits<{ update: [Partial<Placement>] }>();

const size = computed(() => placementSize(props.placement, props.product));

/** Пределы оси; null — ось не тянется, поля быть не должно. */
function limits(axis: 'widthMm' | 'heightMm') {
  return axisLimits(props.product, axis);
}

/**
 * Пустое поле возвращает каталожный размер, а не ноль: так снимают
 * заказанный размер, не набирая его обратно вручную.
 */
function setSize(axis: 'widthMm' | 'heightMm', raw: string): void {
  const next = { ...props.placement.size };
  const value = Number(raw);

  if (raw.trim() === '') delete next[axis];
  else if (Number.isFinite(value) && value > 0) next[axis] = Math.round(value);
  else return;

  emit('update', { size: next });
}
</script>

<template>
  <div class="fields">
    <NumberField
      v-if="limits('widthMm')"
      label="Ширина, мм"
      :value="size.widthMm"
      :min="limits('widthMm')!.minMm"
      :max="limits('widthMm')!.maxMm"
      @change="setSize('widthMm', $event)"
    />
    <NumberField
      v-if="limits('heightMm')"
      label="Высота изделия, мм"
      :value="size.heightMm"
      :min="limits('heightMm')!.minMm"
      :max="limits('heightMm')!.maxMm"
      @change="setSize('heightMm', $event)"
    />
  </div>
</template>

<style scoped>
.fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
</style>
