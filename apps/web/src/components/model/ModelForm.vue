<script setup lang="ts">
import { computed } from 'vue';
import type { CatalogProduct } from '@furni/shared';
import { skuFrom, type ModelDraft } from '../../lib/modelDraft';

/**
 * Карточка каталога для загруженной модели.
 *
 * Габариты сюда не вводят: их меряет сама модель, и повторный ввод рано
 * или поздно разойдётся с геометрией. Роль, наоборот, ввести обязательно —
 * по ней считаются правила эргономики, а из имени файла её не вывести.
 */
const model = defineModel<ModelDraft>({ required: true });
const props = defineProps<{ materials: readonly string[] }>();

const ROLES: readonly { value: CatalogProduct['role']; label: string }[] = [
  { value: 'base', label: 'Нижний модуль' },
  { value: 'wall', label: 'Навесной модуль' },
  { value: 'tall', label: 'Пенал' },
  { value: 'worktop', label: 'Столешница' },
  { value: 'sink', label: 'Мойка' },
  { value: 'hob', label: 'Варочная панель' },
  { value: 'hood', label: 'Вытяжка' },
  { value: 'fridge', label: 'Холодильник' },
  { value: 'oven', label: 'Духовой шкаф' },
  { value: 'dishwasher', label: 'Посудомоечная машина' },
  { value: 'washer', label: 'Стиральная машина' },
  { value: 'microwave', label: 'Микроволновая печь' },
  { value: 'furniture', label: 'Мебель вне кухни' },
  { value: 'part', label: 'Деталь или фурнитура' },
];

/** Артикул показывается подсказкой, пока его не задали руками. */
const suggestedSku = computed(() => skuFrom(model.value.name));

function patch(change: Partial<ModelDraft>): void {
  model.value = { ...model.value, ...change };
}

const numberFrom = (event: Event): number => {
  const value = Number((event.target as HTMLInputElement).value);
  return Number.isFinite(value) ? value : 0;
};
</script>

<template>
  <form class="form" @submit.prevent>
    <label class="field">
      <span class="field__label">Название</span>
      <input
        :value="model.name"
        type="text"
        placeholder="Кухня: нижний шкаф 800"
        @input="patch({ name: ($event.target as HTMLInputElement).value })"
      />
    </label>

    <div class="row">
      <label class="field">
        <span class="field__label">Артикул</span>
        <input
          :value="model.sku"
          type="text"
          :placeholder="suggestedSku || 'SKU-001'"
          @input="patch({ sku: ($event.target as HTMLInputElement).value })"
        />
      </label>
      <label class="field">
        <span class="field__label">Категория</span>
        <input
          :value="model.category"
          type="text"
          placeholder="Кухня / Нижние модули"
          @input="patch({ category: ($event.target as HTMLInputElement).value })"
        />
      </label>
    </div>

    <label class="field">
      <span class="field__label">Роль в кухне</span>
      <select :value="model.role" @change="patch({ role: ($event.target as HTMLSelectElement).value as CatalogProduct['role'] })">
        <option v-for="role in ROLES" :key="role.value" :value="role.value">{{ role.label }}</option>
      </select>
      <span class="field__hint">По роли считаются правила эргономики и готовые раскладки</span>
    </label>

    <div class="row">
      <label class="field">
        <span class="field__label">Цена, ₽</span>
        <input
          :value="model.priceRubles"
          type="number"
          min="0"
          step="100"
          @input="patch({ priceRubles: numberFrom($event) })"
        />
      </label>
      <label class="field">
        <span class="field__label">Высота установки, мм</span>
        <input
          :value="model.mountHeightMm"
          type="number"
          min="0"
          step="10"
          @input="patch({ mountHeightMm: numberFrom($event) })"
        />
        <span class="field__hint">Навесной ряд висит на 1450, напольный — на нуле</span>
      </label>
    </div>

    <label class="toggle">
      <input
        type="checkbox"
        :checked="model.snapToWall"
        @change="patch({ snapToWall: ($event.target as HTMLInputElement).checked })"
      />
      <span>
        Примагничивается к стенам
        <span class="toggle__hint">Мелкая фурнитура к стене липнуть не должна</span>
      </span>
    </label>

    <label class="toggle">
      <input
        type="checkbox"
        :checked="model.stackable"
        @change="patch({ stackable: ($event.target as HTMLInputElement).checked })"
      />
      <span>
        Ставится на другие объекты
        <span class="toggle__hint">Мойку кладут на столешницу, а тумба стоит на полу</span>
      </span>
    </label>

    <section v-if="props.materials.length > 0" class="materials">
      <span class="field__label">Материалы модели</span>
      <ul class="materials__list">
        <li v-for="material in props.materials" :key="material" class="materials__chip">
          {{ material }}
        </li>
      </ul>
      <span class="field__hint">
        Отделка подключается по этим именам: слот каталога ищет материал с таким кодом
      </span>
    </section>
  </form>
</template>

<style scoped>
.form {
  display: grid;
  gap: var(--gap-3);
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--gap-2);
}

.field {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.field__label {
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--c-text-faint);
}

.field__hint {
  font-size: var(--t-xs);
  line-height: 1.4;
  color: var(--c-text-faint);
}

input[type='text'],
input[type='number'],
select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  background: var(--c-bg);
  font: inherit;
  font-size: var(--t-md);
  color: var(--c-text);
  transition: border-color 0.15s var(--ease), box-shadow 0.15s var(--ease);
}

input::placeholder {
  color: var(--c-text-faint);
}

input:focus,
select:focus {
  outline: none;
  border-color: var(--c-accent);
  box-shadow: 0 0 0 3px var(--c-accent-soft);
}

.toggle {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--gap-2);
  align-items: start;
  font-size: var(--t-md);
  line-height: 1.35;
  cursor: pointer;
}

.toggle__hint {
  display: block;
  margin-top: 2px;
  font-size: var(--t-xs);
  color: var(--c-text-faint);
}

.materials {
  display: grid;
  gap: 5px;
}

.materials__list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.materials__chip {
  padding: 3px 9px;
  border: 1px solid var(--c-line);
  border-radius: var(--r-pill);
  background: var(--c-bg-sunken);
  font-size: var(--t-sm);
  color: var(--c-text-muted);
}
</style>
