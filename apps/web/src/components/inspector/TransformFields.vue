<script setup lang="ts">
import { normalizeAngleDeg, type Placement } from '@furni/shared';
import NumberField from './NumberField.vue';

/** Положение и поворот объекта: точные значения вместо перетаскивания. */
const props = defineProps<{ placement: Placement }>();
const emit = defineEmits<{ update: [Partial<Placement>] }>();

/** Пустой или нечисловой ввод не должен обнулять положение. */
function movePart(axis: 'x' | 'y' | 'z', raw: string): void {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  emit('update', { position: { ...props.placement.position, [axis]: Math.round(value) } });
}

function setRotation(raw: string): void {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  emit('update', { rotationY: normalizeAngleDeg(Math.round(value)) });
}

function turnBy(deltaDeg: number): void {
  emit('update', { rotationY: normalizeAngleDeg(props.placement.rotationY + deltaDeg) });
}
</script>

<template>
  <div class="fields">
    <NumberField label="X, мм" :value="placement.position.x" @change="movePart('x', $event)" />
    <NumberField label="Z, мм" :value="placement.position.z" @change="movePart('z', $event)" />
    <NumberField
      label="Высота, мм"
      :value="placement.position.y"
      :min="0"
      @change="movePart('y', $event)"
    />
    <NumberField
      label="Поворот, °"
      :value="placement.rotationY"
      :step="1"
      @change="setRotation($event)"
    />
  </div>

  <div class="turns">
    <button type="button" title="Повернуть на 90° против часовой" @click="turnBy(-90)">
      ⟲ 90°
    </button>
    <button type="button" title="Повернуть на 90° по часовой" @click="turnBy(90)">⟳ 90°</button>
  </div>
</template>

<style scoped>
.fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.turns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.turns button {
  padding: 6px 10px;
  border: 1px solid #d5d8dd;
  border-radius: 7px;
  background: #fff;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.turns button:hover {
  border-color: #b6c2d4;
}
</style>
