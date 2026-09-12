<script setup lang="ts">
import { computed } from 'vue';
import {
  MIN_OPENING_WIDTH_MM,
  openingMaterial,
  openingStyle,
  stylesForKind,
  type CatalogMaterial,
  type Opening,
  type OpeningStyle,
} from '@furni/shared';

/**
 * Свойства двери или окна в проёме.
 *
 * Правится ровно то, что заказчик выбирает в салоне: изделие, цвет,
 * размеры и сторона навески. Размеры даны числами, а не ползунками:
 * полотна идут стандартным рядом, и попасть в него мышью невозможно.
 */
const props = defineProps<{
  opening: Opening;
  materials: ReadonlyMap<string, CatalogMaterial>;
}>();

const emit = defineEmits<{ update: [Partial<Opening>]; remove: [] }>();

const styles = computed<OpeningStyle[]>(() =>
  stylesForKind(props.opening.kind === 'window' ? 'window' : 'door'),
);
const style = computed(() => openingStyle(props.opening.sku) ?? styles.value[0]!);
const isDoor = computed(() => props.opening.kind === 'door');
const chosenMaterial = computed(() => openingMaterial(style.value, props.opening.options));

/** Цвет образца: свой из каталога тенанта, иначе нейтральная заливка. */
function swatch(code: string): string {
  const material = props.materials.get(code);
  if (!material) return '#d9dce1';
  const [r, g, b] = material.baseColorFactor;
  // Множитель цвета линейный, показываем его в sRGB — иначе образец
  // заметно темнее того, что видно в сцене
  const channel = (value: number) => Math.round(255 * value ** (1 / 2.2));
  return `rgb(${channel(r)} ${channel(g)} ${channel(b)})`;
}

function materialName(code: string): string {
  return props.materials.get(code)?.name ?? code;
}

/**
 * Смена изделия подставляет его размеры.
 *
 * Иначе трёхстворчатое окно встаёт в проём одностворчатого и обрезается
 * по его ширине: выбранное изделие обязано появиться целиком.
 */
function pickStyle(next: OpeningStyle): void {
  if (next.code === style.value.code) return;
  emit('update', {
    sku: next.code,
    width: next.widthMm,
    height: next.heightMm,
    sillHeight: next.sillHeightMm,
    options: {},
  });
}

function pickMaterial(code: string): void {
  emit('update', { options: { ...props.opening.options, material: code } });
}

function setNumber(field: 'width' | 'height' | 'sillHeight', value: number): void {
  if (!Number.isFinite(value)) return;
  const min = field === 'width' ? MIN_OPENING_WIDTH_MM : field === 'height' ? 300 : 0;
  emit('update', { [field]: Math.max(min, Math.round(value)) });
}
</script>

<template>
  <section class="opening">
    <header class="opening__head">
      <span class="opening__name">{{ style.name }}</span>
      <span class="opening__size">
        {{ props.opening.width }} × {{ props.opening.height }} мм
      </span>
    </header>

    <section class="field">
      <span class="field__label">Изделие</span>
      <ul class="options">
        <li v-for="item in styles" :key="item.code">
          <button
            type="button"
            class="option"
            :class="{ 'option--active': item.code === style.code }"
            @click="pickStyle(item)"
          >
            {{ item.name }}
          </button>
        </li>
      </ul>
    </section>

    <section class="field">
      <span class="field__label">Цвет</span>
      <ul class="options options--row">
        <li v-for="code in style.materials" :key="code">
          <button
            type="button"
            class="option option--swatch"
            :class="{ 'option--active': code === chosenMaterial }"
            :title="materialName(code)"
            @click="pickMaterial(code)"
          >
            <span class="swatch" :style="{ background: swatch(code) }" />
            <span class="option__name">{{ materialName(code) }}</span>
          </button>
        </li>
      </ul>
    </section>

    <div class="grid">
      <label class="number">
        Ширина, мм
        <input
          type="number"
          :min="MIN_OPENING_WIDTH_MM"
          step="50"
          :value="props.opening.width"
          @change="setNumber('width', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="number">
        Высота, мм
        <input
          type="number"
          min="300"
          step="50"
          :value="props.opening.height"
          @change="setNumber('height', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="number">
        Низ проёма, мм
        <input
          type="number"
          min="0"
          step="50"
          :value="props.opening.sillHeight"
          @change="setNumber('sillHeight', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
    </div>

    <!-- Открывание есть только у двери: у окна створки не выметают
         место в комнате, и предлагать выбор было бы обманом -->
    <template v-if="isDoor">
      <section class="field">
        <span class="field__label">Петли</span>
        <ul class="options options--row">
          <li v-for="side in (['left', 'right'] as const)" :key="side">
            <button
              type="button"
              class="option"
              :class="{ 'option--active': props.opening.hinge === side }"
              @click="emit('update', { hinge: side })"
            >
              {{ side === 'left' ? 'Слева' : 'Справа' }}
            </button>
          </li>
        </ul>
      </section>

      <section class="field">
        <span class="field__label">Открывается</span>
        <ul class="options options--row">
          <li v-for="inward in [true, false]" :key="String(inward)">
            <button
              type="button"
              class="option"
              :class="{ 'option--active': props.opening.swingInward === inward }"
              @click="emit('update', { swingInward: inward })"
            >
              {{ inward ? 'В комнату' : 'Из комнаты' }}
            </button>
          </li>
        </ul>
      </section>
    </template>

    <button type="button" class="remove" @click="emit('remove')">Удалить проём</button>
  </section>
</template>

<style scoped>
.opening {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 244px;
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px solid #e5e7ec;
  border-radius: 12px;
  background: rgb(255 255 255 / 0.96);
  box-shadow: 0 8px 24px rgb(16 24 40 / 0.1);
  backdrop-filter: blur(6px);
}
.opening__head {
  display: grid;
  gap: 2px;
}
.opening__name {
  font-size: 13px;
  font-weight: 600;
}
.opening__size {
  font-size: 11px;
  color: #8a909b;
  font-variant-numeric: tabular-nums;
}
.field {
  display: grid;
  gap: 5px;
}
.field__label {
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8a909b;
}
.options {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.options--row {
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
}
.option {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #e2e4e9;
  border-radius: 8px;
  background: #fff;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.option:hover {
  border-color: #b6c2d4;
}
.option--active {
  border-color: #2f6fed;
  box-shadow: inset 0 0 0 1px #2f6fed;
}
.option--swatch {
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 4px;
}
.option__name {
  font-size: 10px;
  color: #6b7280;
  text-align: center;
  line-height: 1.2;
}
.swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid rgb(0 0 0 / 0.12);
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.number {
  display: grid;
  gap: 3px;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8a909b;
}
.number input {
  width: 100%;
  padding: 5px 7px;
  border: 1px solid #d5d8dd;
  border-radius: 6px;
  font: inherit;
  font-size: 13px;
  color: #111418;
  font-variant-numeric: tabular-nums;
  text-transform: none;
}
.remove {
  padding: 7px 9px;
  border: 1px solid #f0c3bd;
  border-radius: 8px;
  background: #fff;
  color: #b42318;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.remove:hover {
  background: #fef3f2;
}
</style>
