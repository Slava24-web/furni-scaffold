<script setup lang="ts">
import { ref } from 'vue';
import { KITCHEN_TEMPLATES, type KitchenTemplate } from '@furni/shared';

/**
 * Готовые кухни.
 *
 * Своя вкладка, а не строка в тулбаре: шаблон выбирают глазами, и ему
 * нужны образцы отделки и описание типажа. «Прямая / Угловая /
 * П-образная» отвечали на вопрос о геометрии, а покупатель спрашивает,
 * как это будет выглядеть.
 */
const props = defineProps<{
  /** Нечего собирать, пока не построено помещение */
  ready: boolean;
  /** Что помешало собрать выбранный шаблон */
  problem: string | null;
}>();

const emit = defineEmits<{ apply: [KitchenTemplate] }>();

const applied = ref<string | null>(null);

function apply(template: KitchenTemplate): void {
  applied.value = template.id;
  emit('apply', template);
}
</script>

<template>
  <div class="templates scroll-thin">
    <p v-if="!props.ready" class="templates__hint">
      Задайте размеры комнаты сверху — шаблон встанет по ним
    </p>
    <p v-else-if="props.problem" class="templates__problem">{{ props.problem }}</p>

    <ul class="templates__list">
      <li v-for="template in KITCHEN_TEMPLATES" :key="template.id">
        <button
          type="button"
          class="card"
          :class="{ 'card--active': applied === template.id }"
          :disabled="!props.ready"
          @click="apply(template)"
        >
          <span class="card__swatch" aria-hidden="true">
            <span class="card__chip" :style="{ background: template.swatch[0] }" />
            <span class="card__chip" :style="{ background: template.swatch[1] }" />
          </span>
          <span class="card__text">
            <span class="card__name">
              {{ template.name }}
              <span class="card__style">{{ template.style }}</span>
            </span>
            <span class="card__description">{{ template.description }}</span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.templates {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--gap-3);
}

.templates__hint,
.templates__problem {
  margin: 0 0 var(--gap-2);
  font-size: var(--t-sm);
  line-height: 1.45;
  color: var(--c-text-muted);
}

.templates__problem {
  padding: 8px 10px;
  border: 1px solid var(--c-warn-line);
  border-radius: var(--r-sm);
  background: var(--c-warn-soft);
  color: var(--c-warn);
}

.templates__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--gap-2);
}

.card {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--gap-3);
  align-items: start;
  padding: 10px;
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  background: var(--c-bg);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease),
    transform 0.08s var(--ease);
}

.card:hover:not(:disabled) {
  border-color: var(--c-line-strong);
  box-shadow: var(--sh-md);
}

.card:active:not(:disabled) {
  transform: translateY(1px);
}

.card:disabled {
  opacity: 0.5;
  cursor: default;
}

.card--active {
  border-color: var(--c-accent);
  box-shadow: 0 0 0 1px var(--c-accent);
}

/* Образец отделки: фасад сверху, столешница снизу. По нему шаблон
   узнаётся раньше, чем прочитано название */
.card__swatch {
  display: grid;
  grid-template-rows: 1fr 1fr;
  width: 38px;
  height: 38px;
  border-radius: var(--r-sm);
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgb(22 24 29 / 0.10);
}

.card__chip {
  display: block;
}

.card__text {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.card__name {
  display: flex;
  gap: 6px;
  align-items: baseline;
  font-size: var(--t-md);
  font-weight: 600;
  color: var(--c-text);
}

.card__style {
  font-size: var(--t-xs);
  font-weight: 500;
  color: var(--c-text-faint);
}

.card__description {
  font-size: var(--t-sm);
  line-height: 1.4;
  color: var(--c-text-muted);
}
</style>
