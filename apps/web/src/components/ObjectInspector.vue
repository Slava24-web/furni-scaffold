<script setup lang="ts">
import { computed } from 'vue';
import type { CatalogProduct, ConflictReport, Placement } from '@furni/shared';
import { conflictMessage } from '../lib/conflictMessage';

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
  conflicts: ConflictReport | undefined;
}>();

const emit = defineEmits<{
  update: [Partial<Placement>];
  remove: [];
}>();

const conflict = computed(() => conflictMessage(props.conflicts));

const size = computed(() =>
  props.product
    ? `${props.product.widthMm} × ${props.product.heightMm} × ${props.product.depthMm} мм`
    : 'габарит неизвестен',
);

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
        <span class="inspector__size">{{ size }}</span>
      </span>
    </header>

    <p v-if="conflict" class="inspector__conflict">{{ conflict }}</p>

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
.inspector__conflict {
  margin: 0;
  padding: 7px 9px;
  border-radius: 8px;
  background: #fef3f2;
  color: #b42318;
  font-size: 11px;
  line-height: 1.35;
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
