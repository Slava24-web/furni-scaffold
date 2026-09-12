<script setup lang="ts">
import { computed } from 'vue';
import {
  axisLimits,
  isResizable,
  placementSize,
  selectedFinish,
  type CatalogMaterial,
  type CatalogProduct,
  type ConflictReport,
  type FinishSlot,
  type Placement,
} from '@furni/shared';
import { conflictMessage } from '../lib/conflictMessage';
import { formatDelta, formatPrice } from '../lib/money';

/**
 * Свойства выделенного объекта.
 *
 * Плавает над сценой, а не занимает колонку: иначе выделение и снятие
 * выделения меняли бы ширину канваса, а это пересборка буферов рендерера
 * на каждый клик.
 */
const props = defineProps<{
  placement: Placement;
  product: CatalogProduct | undefined;
  materials: ReadonlyMap<string, CatalogMaterial>;
  priceCents: number;
  conflicts: ConflictReport | undefined;
}>();

const emit = defineEmits<{
  update: [Partial<Placement>];
  remove: [];
  /** Открыть или закрыть дверцы выделенного изделия */
  setDoors: [boolean];
}>();

const conflict = computed(() => conflictMessage(props.conflicts));

/** Текущий выбор по каждому слоту отделки. */
function chosen(slot: FinishSlot): string {
  return selectedFinish(slot.code, slot, props.placement.options);
}

/** Надбавка варианта относительно исполнения, включённого в цену. */
function optionDelta(slot: FinishSlot, code: string): string | null {
  const selected = props.materials.get(code)?.priceModifierCents ?? 0;
  const included = props.materials.get(slot.slotMaterial)?.priceModifierCents ?? 0;
  return formatDelta(selected - included);
}

function optionName(code: string): string {
  return props.materials.get(code)?.name ?? code;
}

/** Кружок-образец: показывает цвет материала, а не только название. */
function swatch(code: string): string {
  const colour = props.materials.get(code)?.baseColorFactor;
  if (!colour) return '#d5d8dd';
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) ** (1 / 2.2) * 255);
  return `rgb(${channel(colour[0])} ${channel(colour[1])} ${channel(colour[2])})`;
}

function pickFinish(slot: FinishSlot, code: string): void {
  emit('update', { options: { ...props.placement.options, [slot.code]: code } });
}

/** Заказанный размер: он же показывается в шапке. */
const size = computed(() =>
  props.product ? placementSize(props.placement, props.product) : null,
);

const sizeLabel = computed(() =>
  size.value
    ? `${size.value.widthMm} × ${size.value.heightMm} × ${size.value.depthMm} мм`
    : 'габарит неизвестен',
);

const stretchable = computed(() => (props.product ? isResizable(props.product) : false));

/** Отличается ли заказанный размер от каталожного. */
const customSize = computed(() => Object.keys(props.placement.size ?? {}).length > 0);

/** Пределы оси; null — ось не тянется, поля быть не должно. */
function limits(axis: 'widthMm' | 'heightMm') {
  return props.product ? axisLimits(props.product, axis) : null;
}

/**
 * Заказ размера.
 *
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

/** Поле координаты: пустой ввод не должен обнулять положение. */
function movePart(axis: 'x' | 'y' | 'z', raw: string): void {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  emit('update', { position: { ...props.placement.position, [axis]: Math.round(value) } });
}

function setRotation(raw: string): void {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  emit('update', { rotationY: normalize(Math.round(value)) });
}

function turnBy(deltaDeg: number): void {
  emit('update', { rotationY: normalize(props.placement.rotationY + deltaDeg) });
}

/** Схема документа держит поворот в диапазоне -360..360. */
function normalize(deg: number): number {
  const wrapped = ((deg % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}
</script>

<template>
  <section class="inspector" :class="{ 'inspector--conflict': Boolean(conflict) }">
    <header class="inspector__head">
      <img
        v-if="props.product?.thumbnailUrl"
        class="inspector__preview"
        :src="props.product.thumbnailUrl"
        :alt="props.product.name"
        width="60"
        height="45"
        decoding="async"
      />
      <span class="inspector__titles">
        <span class="inspector__name">{{ props.product?.name ?? props.placement.sku }}</span>
        <span class="inspector__size">{{ sizeLabel }}</span>
      </span>
    </header>

    <p v-if="conflict" class="inspector__conflict">{{ conflict }}</p>

    <!-- Ящики выдвигаются тапом по фасаду: без подсказки об этом
         не догадаться, снаружи изделие выглядит цельным -->
    <p v-if="(props.product?.drawerCount ?? 0) > 0" class="inspector__tip">
      Тап по фасаду выдвигает ящик
    </p>

    <!-- Дверцы: тапом по одной, кнопками — всеми сразу. Заглянуть внутрь
         шкафа надо, чтобы увидеть полки и понять, что покупаешь -->
    <section v-if="(props.product?.doorCount ?? 0) > 0" class="doors">
      <span class="field__label">Дверцы</span>
      <div class="doors__buttons">
        <button type="button" @click="emit('setDoors', true)">Открыть</button>
        <button type="button" @click="emit('setDoors', false)">Закрыть</button>
      </div>
    </section>

    <section v-for="slot in props.product?.finishes ?? []" :key="slot.code" class="finish">
      <span class="finish__label">{{ slot.label }}</span>
      <ul class="finish__options">
        <li v-for="code in slot.options" :key="code">
          <button
            type="button"
            class="finish__option"
            :class="{ 'finish__option--active': chosen(slot) === code }"
            @click="pickFinish(slot, code)"
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

    <!-- Размеры правятся только там, где изделие тянется: у техники
         габарит стандартный, и поле ввода обещало бы невозможное -->
    <div v-if="stretchable" class="fields">
      <label v-if="limits('widthMm')" class="field">
        <span class="field__label">Ширина, мм</span>
        <input
          type="number"
          :min="limits('widthMm')!.minMm"
          :max="limits('widthMm')!.maxMm"
          step="10"
          :value="size?.widthMm"
          @change="setSize('widthMm', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label v-if="limits('heightMm')" class="field">
        <span class="field__label">Высота изделия, мм</span>
        <input
          type="number"
          :min="limits('heightMm')!.minMm"
          :max="limits('heightMm')!.maxMm"
          step="10"
          :value="size?.heightMm"
          @change="setSize('heightMm', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <p class="price">
      <span>Цена позиции</span>
      <strong>{{ formatPrice(props.priceCents) }}</strong>
    </p>

    <!-- Цену за нестандартный габарит считает магазин: правило пересчёта
         живёт в его прайсе, а не в браузере -->
    <p v-if="customSize" class="inspector__note">
      Цена показана за каталожный размер. Заказ по вашим габаритам магазин
      пересчитает при подтверждении.
    </p>

    <div class="fields">
      <label class="field">
        <span class="field__label">X, мм</span>
        <input
          type="number"
          step="10"
          :value="props.placement.position.x"
          @change="movePart('x', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="field">
        <span class="field__label">Z, мм</span>
        <input
          type="number"
          step="10"
          :value="props.placement.position.z"
          @change="movePart('z', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="field">
        <span class="field__label">Высота, мм</span>
        <input
          type="number"
          step="10"
          min="0"
          :value="props.placement.position.y"
          @change="movePart('y', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="field">
        <span class="field__label">Поворот, °</span>
        <input
          type="number"
          step="1"
          :value="props.placement.rotationY"
          @change="setRotation(($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <div class="turns">
      <button type="button" title="Повернуть на 90° против часовой" @click="turnBy(-90)">
        ⟲ 90°
      </button>
      <button type="button" title="Повернуть на 90° по часовой" @click="turnBy(90)">
        ⟳ 90°
      </button>
    </div>

    <label class="lock">
      <input
        type="checkbox"
        :checked="props.placement.locked"
        @change="emit('update', { locked: ($event.target as HTMLInputElement).checked })"
      />
      <span>Закрепить: не двигается и не поворачивается</span>
    </label>

    <button type="button" class="remove" @click="emit('remove')">Удалить объект</button>
  </section>
</template>

<style scoped>
.inspector {
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
.inspector--conflict {
  border-color: #f0a9a2;
}
.inspector__head {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}
.inspector__preview {
  display: block;
  border-radius: 7px;
  background: #f1f2f5;
  object-fit: contain;
}
.inspector__titles {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.inspector__name {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.25;
}
.inspector__size {
  font-size: 11px;
  color: #8a909b;
  font-variant-numeric: tabular-nums;
}
.doors {
  display: grid;
  gap: 5px;
}
.doors__buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.doors__buttons button {
  padding: 6px 8px;
  border: 1px solid #e2e4e9;
  border-radius: 8px;
  background: #fff;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.doors__buttons button:hover {
  border-color: #b6c2d4;
}
.inspector__note {
  margin: 0;
  font-size: 10px;
  line-height: 1.35;
  color: #8a909b;
}
.inspector__tip {
  margin: 0;
  padding: 7px 9px;
  border-radius: 8px;
  background: #eef3fe;
  color: #2f5db0;
  font-size: 11px;
  line-height: 1.35;
}
.inspector__conflict {
  margin: 0;
  padding: 7px 9px;
  border-radius: 8px;
  background: #fef3f2;
  color: #b42318;
  font-size: 11px;
  line-height: 1.35;
}
.finish {
  display: grid;
  gap: 5px;
}
.finish__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #8a909b;
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
  border: 1px solid #e5e7ec;
  border-radius: 8px;
  background: #fff;
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.finish__option:hover {
  border-color: #b6c2d4;
}
.finish__option--active {
  border-color: #2f6fed;
  box-shadow: inset 0 0 0 1px #2f6fed;
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
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}
.price {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 0;
  padding-top: 10px;
  border-top: 1px solid #eceef2;
  font-size: 12px;
  color: #6b7280;
}
.price strong {
  font-size: 14px;
  color: #111418;
  font-variant-numeric: tabular-nums;
}
.fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.field {
  display: grid;
  gap: 3px;
}
.field__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #8a909b;
}
input[type='number'] {
  width: 100%;
  padding: 5px 7px;
  border: 1px solid #d5d8dd;
  border-radius: 7px;
  font: inherit;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
input[type='number']:focus {
  outline: 2px solid #2f6fed;
  outline-offset: -1px;
  border-color: transparent;
}
.turns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.turns button,
.remove {
  padding: 6px 10px;
  border: 1px solid #d5d8dd;
  border-radius: 7px;
  background: #fff;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.turns button:hover,
.remove:hover {
  border-color: #b6c2d4;
}
.remove {
  color: #b42318;
  border-color: #f0c2bd;
}
.remove:hover {
  background: #fef3f2;
  border-color: #e0837a;
}
.lock {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  font-size: 11px;
  color: #4b5462;
  line-height: 1.35;
  cursor: pointer;
}
</style>
