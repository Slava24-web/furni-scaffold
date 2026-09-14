<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { PhPlus } from '@phosphor-icons/vue';
import type { CatalogProduct } from '@furni/shared';
import { useCatalogStore } from '../stores/catalog';

const props = defineProps<{ dragging: CatalogProduct | null }>();
const emit = defineEmits<{ dragStart: [CatalogProduct, PointerEvent] }>();

const catalog = useCatalogStore();

const price = (cents: number): string =>
  `${(cents / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;

const size = (product: CatalogProduct): string =>
  `${product.widthMm}×${product.heightMm}×${product.depthMm}`;
</script>

<template>
  <div class="catalog scroll-thin">
    <p v-if="catalog.loading" class="catalog__note">Загрузка…</p>
    <p v-else-if="catalog.error" class="catalog__note catalog__note--error">
      {{ catalog.error }}
    </p>

    <section v-for="group in catalog.groups" :key="group.category" class="group">
      <h3 class="group__title">{{ group.category }}</h3>
      <ul class="group__items">
        <li
          v-for="product in group.products"
          :key="product.sku"
          class="item"
          :class="{ 'item--dragging': props.dragging?.sku === product.sku }"
          @pointerdown="emit('dragStart', product, $event)"
        >
          <!-- Превью рисуется пайплайном по той же геометрии, что и модель -->
          <img
            v-if="product.thumbnailUrl"
            class="item__preview"
            :src="product.thumbnailUrl"
            :alt="product.name"
            width="76"
            height="57"
            loading="lazy"
            decoding="async"
            draggable="false"
          />
          <span v-else class="item__preview item__preview--empty" aria-hidden="true" />

          <span class="item__text">
            <span class="item__name">{{ product.name }}</span>
            <span class="item__meta">{{ size(product) }} мм</span>
            <span class="item__bottom">
              <span class="item__price">{{ price(product.basePriceCents) }}</span>
              <span v-if="product.mountHeightMm > 0" class="item__badge">
                на {{ product.mountHeightMm }} мм
              </span>
            </span>
          </span>
        </li>
      </ul>
    </section>

    <!-- Своя модель в каталог: пока пайплайн собирает изделия кодом,
         магазину нужен способ отдать готовый файл -->
    <RouterLink to="/models/new" class="add">
      <PhPlus :size="15" weight="regular" />
      Загрузить свою модель
    </RouterLink>
  </div>
</template>

<style scoped>
.add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: var(--gap-3);
  padding: 10px;
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--r-md);
  color: var(--c-text-muted);
  font-size: var(--t-sm);
  text-decoration: none;
  transition: border-color 0.13s var(--ease), color 0.13s var(--ease),
    background-color 0.13s var(--ease);
}

.add:hover {
  border-color: var(--c-accent);
  background: var(--c-accent-soft);
  color: var(--c-accent-hover);
}

.catalog {
  /* Ширину и фон задаёт колонка: под каталогом ещё живёт смета */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 14px 24px;
  /* Перетаскивание идёт на указательных событиях: без этого браузер
     перехватит жест под прокрутку панели */
  touch-action: pan-y;
}
.catalog__note {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--c-text-muted);
}
.catalog__note--error {
  color: var(--c-danger);
}
.group:first-of-type .group__title {
  margin-top: 2px;
}
.group__title {
  margin: 18px 0 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--c-text-faint);
}
.group__items {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 6px;
}
.item {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 7px 9px;
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  background: #fff;
  cursor: grab;
  user-select: none;
  touch-action: none;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.item:hover {
  border-color: var(--c-line-strong);
  box-shadow: 0 1px 3px rgb(16 24 40 / 0.06);
}
.item--dragging {
  opacity: 0.4;
}
.item__preview {
  display: block;
  width: 76px;
  height: 57px;
  border-radius: var(--r-sm);
  /* Тёплая подложка: у превью прозрачный фон, и на белом светлые
     изделия сливались бы с карточкой */
  background: var(--c-bg-sunken);
  object-fit: contain;
  pointer-events: none;
}
.item__preview--empty {
  background: repeating-linear-gradient(45deg, var(--c-bg-sunken), var(--c-bg-sunken) 6px, var(--c-line) 6px, var(--c-line) 12px);
}
.item__text {
  display: grid;
  gap: 1px;
  min-width: 0;
}
.item__name {
  font-size: 13px;
  line-height: 1.25;
}
.item__meta {
  font-size: 11px;
  color: var(--c-text-faint);
  font-variant-numeric: tabular-nums;
}
.item__bottom {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 3px;
  min-width: 0;
}
.item__price {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
/* Бейдж в общем потоке, а не поверх карточки: абсолютным он налезал
   на длинные названия */
.item__badge {
  flex: none;
  padding: 1px 6px;
  border-radius: var(--r-pill);
  background: #eef2ff;
  color: #3538cd;
  font-size: 10px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
