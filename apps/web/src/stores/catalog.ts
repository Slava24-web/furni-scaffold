import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import {
  CatalogSchema,
  groupByCategory,
  groupFloorsByKind,
  type CatalogMaterial,
  type CatalogProduct,
  type FloorFinish,
} from '@furni/shared';

const CATALOG_URL = '/assets/test/catalog.json';

/**
 * Каталог тенанта.
 *
 * Пока читается из манифеста пайплайна: API каталога появится в фазе 1.
 * Разбор через Zod обязателен — манифест приходит по сети, а тихо
 * принятая старая схема даёт пустую сцену без внятной ошибки.
 */
export const useCatalogStore = defineStore('catalog', () => {
  const products = shallowRef<CatalogProduct[]>([]);
  const materials = shallowRef<CatalogMaterial[]>([]);
  const floors = shallowRef<FloorFinish[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const groups = computed(() => groupByCategory(products.value));
  const bySku = computed(() => new Map(products.value.map((p) => [p.sku, p])));
  const materialByCode = computed(() => new Map(materials.value.map((m) => [m.code, m])));
  const floorGroups = computed(() => groupFloorsByKind(floors.value));

  async function load(): Promise<void> {
    if (loading.value || products.value.length > 0) return;
    loading.value = true;
    error.value = null;

    try {
      const response = await fetch(CATALOG_URL);
      if (!response.ok) {
        throw new Error(
          `каталог не отдан (${response.status}). ` +
            'Сгенерируйте модели: pnpm models:test',
        );
      }
      const catalog = CatalogSchema.parse(await response.json());
      materials.value = catalog.materials;
      floors.value = catalog.floors;
      products.value = catalog.products;
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause);
    } finally {
      loading.value = false;
    }
  }

  return {
    products,
    materials,
    floors,
    groups,
    floorGroups,
    bySku,
    materialByCode,
    loading,
    error,
    load,
  };
});
