<script setup lang="ts">
import { computed } from 'vue';
import { PhCube } from '@phosphor-icons/vue';
import type { CatalogProduct } from '@furni/shared';
import { arHref, arPlatform, glbUrlOf } from '../lib/ar';

/**
 * «Посмотреть у себя»: изделие в комнате покупателя.
 *
 * Обе платформы открывают AR родным просмотрщиком по обычной ссылке —
 * iOS по USDZ, Android по intent на Scene Viewer. Никакого WebXR и
 * никакой библиотеки: разбор в docs/AR.md.
 *
 * На настольном браузере кнопки нет, а есть строка о том, где смотреть.
 * Неработающая кнопка хуже её отсутствия.
 */
const props = defineProps<{ product: CatalogProduct | undefined }>();

const platform = computed(() => arPlatform());

const href = computed(() => {
  if (!props.product) return null;
  return arHref(
    {
      name: props.product.name,
      usdzUrl: props.product.usdzUrl,
      glbUrl: glbUrlOf(props.product.urlTemplate),
    },
    platform.value,
  );
});
</script>

<template>
  <a
    v-if="href"
    class="ar"
    :href="href"
    rel="ar"
    target="_self"
  >
    <PhCube :size="16" weight="regular" />
    Посмотреть у себя
  </a>

  <p v-else-if="props.product" class="ar__note">
    <PhCube :size="14" weight="regular" />
    <span>Откройте планировщик на телефоне, чтобы поставить изделие в своей комнате</span>
  </p>
</template>

<style scoped>
.ar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 9px 12px;
  border: 1px solid var(--c-accent-line);
  border-radius: var(--r-sm);
  background: var(--c-accent-soft);
  color: var(--c-accent-hover);
  font-size: var(--t-md);
  font-weight: 500;
  text-decoration: none;
  transition: background-color 0.13s var(--ease), border-color 0.13s var(--ease);
}

.ar:hover {
  border-color: var(--c-accent);
  background: #e3ecfd;
}

.ar:active {
  transform: translateY(1px);
}

.ar__note {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 7px;
  align-items: start;
  margin: 0;
  font-size: var(--t-xs);
  line-height: 1.4;
  color: var(--c-text-faint);
}
</style>
