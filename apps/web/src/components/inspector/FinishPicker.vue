<script setup lang="ts">
import { selectedFinish, type CatalogMaterial, type FinishSlot, type Placement } from '@furni/shared';
import { formatDelta } from '../../lib/money';

/**
 * Выбор отделки по слотам изделия.
 *
 * Образец цвета обязателен: по названию материала покупатель не поймёт,
 * что получит, а картинка товара показывает только базовое исполнение.
 */
const props = defineProps<{
  slots: readonly FinishSlot[];
  options: Placement['options'];
  materials: ReadonlyMap<string, CatalogMaterial>;
}>();

const emit = defineEmits<{ pick: [FinishSlot, string] }>();

/** Текущий выбор по слоту. */
function chosen(slot: FinishSlot): string {
  return selectedFinish(slot.code, slot, props.options);
}

function optionName(code: string): string {
  return props.materials.get(code)?.name ?? code;
}

/** Надбавка варианта относительно исполнения, включённого в цену. */
function optionDelta(slot: FinishSlot, code: string): string | null {
  const selected = props.materials.get(code)?.priceModifierCents ?? 0;
  const included = props.materials.get(slot.slotMaterial)?.priceModifierCents ?? 0;
  return formatDelta(selected - included);
}

/** Кружок-образец: показывает цвет материала, а не только название. */
function swatch(code: string): string {
  const colour = props.materials.get(code)?.baseColorFactor;
  if (!colour) return 'var(--c-line-strong)';
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) ** (1 / 2.2) * 255);
  return `rgb(${channel(colour[0])} ${channel(colour[1])} ${channel(colour[2])})`;
}
</script>

<template>
  <section v-for="slot in slots" :key="slot.code" class="finish">
    <span class="finish__label">{{ slot.label }}</span>
    <ul class="finish__options">
      <li v-for="code in slot.options" :key="code">
        <button
          type="button"
          class="finish__option"
          :class="{ 'finish__option--active': chosen(slot) === code }"
          @click="emit('pick', slot, code)"
        >
          <span class="finish__swatch" :style="{ background: swatch(code) }" />
          <span class="finish__name">{{ optionName(code) }}</span>
          <span v-if="optionDelta(slot, code)" class="finish__delta">
            {{ optionDelta(slot, code) }}
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.finish {
  display: grid;
  gap: 5px;
}

.finish__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--c-text-faint);
}

.finish__options {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;
}

.finish__option {
  width: 100%;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  background: #fff;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.finish__option:hover {
  border-color: var(--c-text-faint);
}

.finish__option--active {
  border-color: var(--c-accent);
  box-shadow: inset 0 0 0 1px var(--c-accent);
}

.finish__swatch {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid rgb(16 24 40 / 0.12);
}

.finish__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.finish__delta {
  font-size: 11px;
  color: var(--c-text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
