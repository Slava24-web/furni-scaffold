<script setup lang="ts">
import { onMounted } from 'vue';
import type { CatalogProduct } from '@furni/shared';
import { useCatalogStore } from '../stores/catalog';

const props = defineProps<{ dragging: CatalogProduct | null }>();
const emit = defineEmits<{ dragStart: [CatalogProduct, PointerEvent] }>();

const catalog = useCatalogStore();
onMounted(() => void catalog.load());

const price = (cents: number): string =>
  `${(cents / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`;

const size = (product: CatalogProduct): string =>
  `${product.widthMm}×${product.heightMm}×${product.depthMm}`;
</script>

<template>
  <aside class="catalog">
    <h2 class="catalog__title">Каталог</h2>

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
  </aside>
</template>

<style scoped>
.catalog {
  width: 300px;
  flex: none;
  overflow-y: auto;
  padding: 14px 14px 32px;
  border-right: 1px solid #e5e7ec;
  background: #fbfbfc;
  /* Перетаскивание идёт на указательных событиях: без этого браузер
     перехватит жест под прокрутку панели */
  touch-action: pan-y;
}
.catalog__title {
  margin: 2px 0 14px;
  font-size: 15px;
  font-weight: 600;
}
.catalog__note {
  margin: 0 0 12px;
  font-size: 12px;
  color: #6b7280;
}
.catalog__note--error {
  color: #b42318;
}
.group__title {
  margin: 18px 0 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #8a909b;
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
  border: 1px solid #e5e7ec;
  border-radius: 10px;
  background: #fff;
  cursor: grab;
  user-select: none;
  touch-action: none;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.item:hover {
  border-color: #c3cbd8;
  box-shadow: 0 1px 3px rgb(16 24 40 / 0.06);
}
.item--dragging {
  opacity: 0.4;
}
.item__preview {
  display: block;
  width: 76px;
  height: 57px;
  border-radius: 7px;
  /* Тёплая подложка: у превью прозрачный фон, и на белом светлые
     изделия сливались бы с карточкой */
  background: #f1f2f5;
  object-fit: contain;
  pointer-events: none;
}
.item__preview--empty {
  background: repeating-linear-gradient(45deg, #f1f2f5, #f1f2f5 6px, #e9ebef 6px, #e9ebef 12px);
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
  color: #8a909b;
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
  border-radius: 999px;
  background: #eef2ff;
  color: #3538cd;
  font-size: 10px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
