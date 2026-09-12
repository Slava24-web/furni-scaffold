<script setup lang="ts">
import { ref } from 'vue';
import type { FloorFinish } from '@furni/shared';

/**
 * Выбор напольного покрытия.
 *
 * Образцы показываются самой текстурой, а не цветным кружком: у пола
 * важен рисунок укладки, и «дуб серый» ёлочкой и палубой — это два
 * разных пола, которых по кружку не различить.
 */
const props = defineProps<{
  groups: readonly { kind: string; floors: FloorFinish[] }[];
  selected: string | null;
}>();

const emit = defineEmits<{ pick: [string | null] }>();

const open = ref(false);

/** Повторный тап по выбранному покрытию снимает его. */
function pick(code: string): void {
  emit('pick', props.selected === code ? null : code);
}
</script>

<template>
  <section class="floors" :class="{ 'floors--open': open }">
    <button type="button" class="floors__head" @click="open = !open">
      <span class="floors__title">Пол</span>
      <span class="floors__value">{{
        props.groups.flatMap((g) => g.floors).find((f) => f.code === props.selected)?.name ??
        'не выбран'
      }}</span>
      <span class="floors__chevron" :class="{ 'floors__chevron--open': open }">⌄</span>
    </button>

    <div v-if="open" class="floors__body">
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
  </section>
</template>

<style scoped>
.floors {
  border-top: 1px solid #e5e7ec;
  background: #fff;
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.floors--open {
  flex: 1 1 auto;
}
.floors__head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: baseline;
  width: 100%;
  padding: 9px 12px;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.floors__title {
  font-size: 12px;
  font-weight: 600;
}
.floors__value {
  font-size: 11px;
  color: #8a909b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.floors__chevron {
  font-size: 12px;
  color: #8a909b;
  transition: transform 0.15s;
}
.floors__chevron--open {
  transform: rotate(180deg);
}
.floors__body {
  overflow-y: auto;
  padding: 0 12px 12px;
  display: grid;
  gap: 10px;
}
.group__title {
  margin: 0 0 5px;
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #8a909b;
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
  border-radius: 8px;
  background: #fff;
  font: inherit;
  cursor: pointer;
}
.sample:hover {
  border-color: #b6c2d4;
}
.sample--active {
  border-color: #2f6fed;
  box-shadow: inset 0 0 0 1px #2f6fed;
}
.sample__image {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 5px;
  object-fit: cover;
}
.sample__name {
  font-size: 9px;
  line-height: 1.2;
  color: #6b7280;
  text-align: center;
}
</style>
