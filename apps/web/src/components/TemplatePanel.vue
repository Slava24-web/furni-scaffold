<script setup lang="ts">
import { ref } from 'vue';
import { KITCHEN_TEMPLATES, type KitchenTemplate } from '@furni/shared';

/**
 * Готовые кухни.
 *
 * Отдельный раздел, а не кнопки в тулбаре: шаблон выбирают глазами, и
 * ему нужны образцы отделки и описание типажа. «Прямая / Угловая /
 * П-образная» отвечали на вопрос о геометрии, а покупатель спрашивает
 * «как это будет выглядеть».
 *
 * Раздел раскрыт по умолчанию, пока в сцене ничего нет: пустой
 * планировщик — это как раз момент, когда шаблон и нужен.
 */
const props = defineProps<{
  /** Нечего собирать, пока не построено помещение */
  ready: boolean;
  /** Сколько объектов уже в сцене: по ним решается, раскрывать ли раздел */
  placed: number;
  /** Что помешало собрать выбранный шаблон */
  problem: string | null;
}>();

const emit = defineEmits<{ apply: [KitchenTemplate] }>();

const open = ref(props.placed === 0);
const applied = ref<string | null>(null);

function apply(template: KitchenTemplate): void {
  applied.value = template.id;
  emit('apply', template);
}
</script>

<template>
  <section class="templates">
    <button type="button" class="templates__head" @click="open = !open">
      <span class="templates__title">Шаблоны</span>
      <span class="templates__count">{{ KITCHEN_TEMPLATES.length }}</span>
      <span class="templates__chevron" :class="{ 'templates__chevron--open': open }">⌄</span>
    </button>

    <div v-if="open" class="templates__body">
      <p v-if="!props.ready" class="templates__hint">
        Сначала постройте помещение — шаблон встанет по его размерам
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
  </section>
</template>

<style scoped>
.templates {
  flex: none;
  border-top: 1px solid #e5e7ec;
  background: #fff;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.templates__head {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 10px 14px;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.templates__title {
  font-size: 13px;
  font-weight: 600;
  color: #111418;
}

.templates__count {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #eef1f6;
  font-size: 11px;
  color: #4b5462;
  text-align: center;
}

.templates__chevron {
  color: #8a909b;
  transition: transform 0.15s;
}

.templates__chevron--open {
  transform: rotate(180deg);
}

.templates__body {
  overflow-y: auto;
  padding: 0 10px 10px;
}

.templates__hint,
.templates__problem {
  margin: 0 4px 8px;
  font-size: 11px;
  line-height: 1.4;
  color: #8a909b;
}

.templates__problem {
  padding: 6px 8px;
  border-left: 3px solid #e0a04a;
  background: #fff8ef;
  color: #7a5320;
}

.templates__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}

.card {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  padding: 8px;
  border: 1px solid #e5e7ec;
  border-radius: 9px;
  background: #fff;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.card:hover:not(:disabled) {
  border-color: #b6c2d4;
  background: #fbfcfe;
}

.card:disabled {
  opacity: 0.5;
  cursor: default;
}

.card--active {
  border-color: #2f6fed;
  background: #f4f8ff;
}

.card__swatch {
  display: grid;
  grid-template-rows: 1fr 1fr;
  width: 34px;
  height: 34px;
  border-radius: 7px;
  overflow: hidden;
  border: 1px solid #d5d8dd;
}

.card__chip {
  display: block;
}

.card__text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.card__name {
  display: flex;
  gap: 6px;
  align-items: baseline;
  font-size: 13px;
  font-weight: 600;
  color: #111418;
}

.card__style {
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #8a909b;
}

.card__description {
  font-size: 11px;
  line-height: 1.35;
  color: #4b5462;
}
</style>
