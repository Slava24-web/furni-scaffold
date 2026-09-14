<script setup lang="ts">
import { computed } from 'vue';
import type { FloorFinish } from '@furni/shared';

/**
 * Выбор покрытия поверхности: пол или стены.
 *
 * Один компонент на оба: и там и там это ряд образцов, сгруппированных
 * по типу, и различаются они только подписью. Разводить два одинаковых
 * списка значило бы чинить их по очереди.
 *
 * Образцы показываются самой текстурой, а не цветным кружком: важен
 * рисунок, и «дуб серый» ёлочкой и палубой — это два разных пола,
 * которых по кружку не различить. У краски кружок сработал бы, но
 * рядом с обоями он выбивался бы из ряда.
 */
const props = defineProps<{
  /** Название поверхности для строки состояния: «Пол», «Стены» */
  label: string;
  groups: readonly { kind: string; floors: FloorFinish[] }[];
  selected: string | null;
}>();

const emit = defineEmits<{ pick: [string | null] }>();

/** Повторный тап по выбранному покрытию снимает его. */
function pick(code: string): void {
  emit('pick', props.selected === code ? null : code);
}

const current = computed(() =>
  props.groups.flatMap((group) => group.floors).find((floor) => floor.code === props.selected),
);
</script>

<template>
  <div class="surface scroll-thin">
    <p class="surface__current">
      {{ props.label }}: <strong>{{ current?.name ?? 'не выбрано' }}</strong>
    </p>

    <section v-for="group in props.groups" :key="group.kind" class="group">
      <h4 class="group__title">{{ group.kind }}</h4>
      <ul class="group__items">
        <li v-for="floor in group.floors" :key="floor.code">
          <button
            type="button"
            class="sample"
            :class="{ 'sample--active': floor.code === props.selected }"
            :title="floor.name"
            @click="pick(floor.code)"
          >
            <img class="sample__image" :src="floor.textureUrl" :alt="floor.name" loading="lazy" />
            <span class="sample__name">{{ floor.name }}</span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.surface {
  display: grid;
  align-content: start;
  gap: var(--gap-4);
}

.surface__current {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--c-text-muted);
}

.surface__current strong {
  font-weight: 500;
  color: var(--c-text);
}

.group__title {
  margin: 0 0 5px;
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--c-text-faint);
  font-weight: 600;
}
.group__items {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.sample {
  display: grid;
  gap: 4px;
  width: 100%;
  padding: 4px;
  border: 1px solid #e2e4e9;
  border-radius: var(--r-md);
  background: #fff;
  font: inherit;
  cursor: pointer;
}
.sample:hover {
  border-color: var(--c-text-faint);
}
.sample--active {
  border-color: var(--c-accent);
  box-shadow: inset 0 0 0 1px var(--c-accent);
}
.sample__image {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--r-sm);
  object-fit: cover;
}
.sample__name {
  font-size: 9px;
  line-height: 1.2;
  color: var(--c-text-muted);
  text-align: center;
}
</style>
