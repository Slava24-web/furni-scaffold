<script setup lang="ts">
import { computed } from 'vue';
import {
  isResizable,
  placementSize,
  type CatalogMaterial,
  type CatalogProduct,
  type ConflictReport,
  type FinishSlot,
  type Placement,
} from '@furni/shared';
import { conflictMessage } from '../lib/conflictMessage';
import { formatPrice } from '../lib/money';
import FinishPicker from './inspector/FinishPicker.vue';
import SizeFields from './inspector/SizeFields.vue';
import TransformFields from './inspector/TransformFields.vue';

/**
 * Свойства выделенного объекта.
 *
 * Плавает над сценой, а не занимает колонку: иначе выделение и снятие
 * выделения меняли бы ширину канваса, а это пересборка буферов рендерера
 * на каждый клик.
 *
 * Сам инспектор только раскладывает блоки; отделка, габарит и положение
 * живут отдельными компонентами в components/inspector.
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

/** Заказанный размер: он же показывается в шапке. */
const sizeLabel = computed(() => {
  if (!props.product) return 'габарит неизвестен';
  const size = placementSize(props.placement, props.product);
  return `${size.widthMm} × ${size.heightMm} × ${size.depthMm} мм`;
});

const stretchable = computed(() => (props.product ? isResizable(props.product) : false));

/** Отличается ли заказанный размер от каталожного. */
const customSize = computed(() => Object.keys(props.placement.size ?? {}).length > 0);

function pickFinish(slot: FinishSlot, code: string): void {
  emit('update', { options: { ...props.placement.options, [slot.code]: code } });
}
</script>

<template>
  <section class="inspector scroll-thin" :class="{ 'inspector--conflict': Boolean(conflict) }">
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
      <span class="doors__label">Дверцы</span>
      <div class="doors__buttons">
        <button type="button" @click="emit('setDoors', true)">Открыть</button>
        <button type="button" @click="emit('setDoors', false)">Закрыть</button>
      </div>
    </section>

    <FinishPicker
      :slots="props.product?.finishes ?? []"
      :options="props.placement.options"
      :materials="props.materials"
      @pick="pickFinish"
    />

    <SizeFields
      v-if="stretchable && props.product"
      :placement="props.placement"
      :product="props.product"
      @update="emit('update', $event)"
    />

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

    <TransformFields :placement="props.placement" @update="emit('update', $event)" />

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
/* Базовый вид кнопки; красный акцент «Удалить» задаётся ниже */
.remove {
  padding: 6px 10px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  background: #fff;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.remove:hover {
  border-color: var(--c-text-faint);
}

.inspector {
  position: absolute;
  top: var(--gap-3);
  right: var(--gap-3);
  z-index: 2;
  /* Не больше сорока процентов сцены: панель поверх неё не должна
     закрывать то, ради чего её открыли */
  width: min(258px, 40%);
  max-height: calc(100% - var(--gap-3) * 2);
  overflow-y: auto;
  display: grid;
  align-content: start;
  gap: var(--gap-3);
  padding: var(--gap-3);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
  background: rgb(255 255 255 / 0.94);
  box-shadow: var(--sh-lg);
  backdrop-filter: blur(10px);
}

/* Полупрозрачная панель поверх сцены: если система просит убрать
   прозрачность, подложка становится сплошной */
@media (prefers-reduced-transparency: reduce) {
  .inspector {
    background: var(--c-bg);
    backdrop-filter: none;
  }
}

.inspector--conflict {
  border-color: var(--c-danger-line);
  box-shadow: var(--sh-lg), 0 0 0 1px var(--c-danger-line);
}

.inspector__head {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
}

.inspector__preview {
  display: block;
  border-radius: var(--r-sm);
  background: var(--c-bg-sunken);
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
  color: var(--c-text-faint);
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
  border-radius: var(--r-md);
  background: #fff;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.doors__buttons button:hover {
  border-color: var(--c-text-faint);
}

.inspector__note {
  margin: 0;
  font-size: 10px;
  line-height: 1.35;
  color: var(--c-text-faint);
}

.inspector__tip {
  margin: 0;
  padding: 7px 9px;
  border-radius: var(--r-md);
  background: #eef3fe;
  color: #2f5db0;
  font-size: 11px;
  line-height: 1.35;
}

.inspector__conflict {
  margin: 0;
  padding: 7px 9px;
  border-radius: var(--r-md);
  background: var(--c-danger-soft);
  color: var(--c-danger);
  font-size: 11px;
  line-height: 1.35;
}

.price {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 0;
  padding-top: 10px;
  border-top: 1px solid #eceef2;
  font-size: 12px;
  color: var(--c-text-muted);
}

.price strong {
  font-size: 14px;
  color: var(--c-text);
  font-variant-numeric: tabular-nums;
}

.remove {
  color: var(--c-danger);
  border-color: var(--c-danger-line);
}

.remove:hover {
  background: var(--c-danger-soft);
  border-color: #e0837a;
}

.lock {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  font-size: 11px;
  color: var(--c-text-muted);
  line-height: 1.35;
  cursor: pointer;
}

.doors__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--c-text-faint);
}

/**
 * Узкая сцена: панель уезжает вниз листом во всю ширину.
 *
 * Справа она занимала две трети сцены, и кликнуть по соседнему объекту
 * было уже некуда — пользователь жал по мебели и попадал в панель.
 * Внизу она отнимает высоту, но оставляет всю ширину видимой.
 */
@media (max-width: 900px) {
  .inspector {
    top: auto;
    right: var(--gap-2);
    bottom: var(--gap-2);
    left: var(--gap-2);
    width: auto;
    max-height: 46%;
  }
}
</style>
