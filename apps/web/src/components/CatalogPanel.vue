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
          <span class="item__name">{{ product.name }}</span>
          <span class="item__meta">{{ size(product) }} мм · {{ price(product.basePriceCents) }}</span>
          <span v-if="product.mountHeightMm > 0" class="item__badge">
            навесной, {{ product.mountHeightMm }} мм
          </span>
        </li>
      </ul>
    </section>
  </aside>
</template>

<style scoped>
.catalog {
  width: 280px;
  flex: none;
  overflow-y: auto;
  padding: 16px;
  border-right: 1px solid #e3e5e8;
  background: #fbfbfc;
  /* Перетаскивание идёт на указательных событиях: без этого браузер
     перехватит жест под прокрутку панели */
  touch-action: pan-y;
}
.catalog__title {
  margin: 0 0 12px;
  font-size: 15px;
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
  margin: 16px 0 8px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
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
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid #e3e5e8;
  border-radius: 8px;
  background: #fff;
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.item:hover {
  border-color: #b6c2d4;
}
.item--dragging {
  opacity: 0.45;
}
.item__name {
  font-size: 13px;
}
.item__meta {
  font-size: 11px;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}
.item__badge {
  justify-self: start;
  margin-top: 2px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3538cd;
  font-size: 10px;
}
</style>
