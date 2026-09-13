<script setup lang="ts">
/**
 * Числовое поле инспектора.
 *
 * Наружу отдаётся сырая строка, а не число: пустое поле у размера
 * означает «вернуть каталожный», и превращать его в ноль нельзя.
 * Решает это вызывающий, а поле только собирает ввод.
 */
defineProps<{
  label: string;
  value: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
  step?: number;
}>();

const emit = defineEmits<{ change: [string] }>();
</script>

<template>
  <label class="field">
    <span class="field__label">{{ label }}</span>
    <input
      type="number"
      :min="min"
      :max="max"
      :step="step ?? 10"
      :value="value"
      @change="emit('change', ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>

<style scoped>
.field {
  display: grid;
  gap: 3px;
}

.field__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--c-text-faint);
}

input[type='number'] {
  width: 100%;
  padding: 5px 7px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  font: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

input[type='number']:focus {
  outline: 2px solid var(--c-accent);
  outline-offset: -1px;
  border-color: transparent;
}
</style>
