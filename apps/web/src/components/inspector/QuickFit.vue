<script setup lang="ts">
import {
  PhArrowLineDown,
  PhArrowLineLeft,
  PhArrowLineRight,
  PhArrowLineUp,
} from '@phosphor-icons/vue';
import type { PushSide } from '@furni/shared';

/**
 * Прижать объект к соседу одним действием.
 *
 * Стороны считаются по самому объекту, а не по осям мира: у повёрнутой
 * тумбы «вправо» — это вдоль её фасада, и стрелка на кнопке означает
 * ровно то, что видно в сцене.
 */
const emit = defineEmits<{ push: [PushSide] }>();

const SIDES: readonly { side: PushSide; title: string }[] = [
  { side: 'left', title: 'Прижать влево (Shift + ←)' },
  { side: 'front', title: 'Прижать вперёд (Shift + ↑)' },
  { side: 'back', title: 'Прижать назад (Shift + ↓)' },
  { side: 'right', title: 'Прижать вправо (Shift + →)' },
];
</script>

<template>
  <section class="fit">
    <span class="fit__label">Прижать к соседу</span>
    <div class="fit__row">
      <button
        v-for="item in SIDES"
        :key="item.side"
        type="button"
        class="fit__button"
        :title="item.title"
        :aria-label="item.title"
        @click="emit('push', item.side)"
      >
        <PhArrowLineLeft v-if="item.side === 'left'" :size="16" weight="regular" />
        <PhArrowLineUp v-else-if="item.side === 'front'" :size="16" weight="regular" />
        <PhArrowLineDown v-else-if="item.side === 'back'" :size="16" weight="regular" />
        <PhArrowLineRight v-else :size="16" weight="regular" />
      </button>
    </div>
    <span class="fit__hint">Стрелки двигают на 10 мм, с Alt — на 1 мм</span>
  </section>
</template>

<style scoped>
.fit {
  display: grid;
  gap: 5px;
}

.fit__label {
  font-size: var(--t-xs);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--c-text-faint);
}

.fit__row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--gap-1);
}

.fit__button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 7px 0;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  background: var(--c-bg);
  color: var(--c-text-muted);
  cursor: pointer;
  transition: border-color 0.13s var(--ease), background-color 0.13s var(--ease),
    color 0.13s var(--ease);
}

.fit__button:hover {
  border-color: var(--c-accent);
  background: var(--c-accent-soft);
  color: var(--c-accent-hover);
}

.fit__button:active {
  transform: translateY(1px);
}

.fit__hint {
  font-size: var(--t-xs);
  line-height: 1.35;
  color: var(--c-text-faint);
}
</style>
