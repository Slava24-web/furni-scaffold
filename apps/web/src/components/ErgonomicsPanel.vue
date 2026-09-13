<script setup lang="ts">
import { computed, ref } from 'vue';
import { PhCaretDown, PhWarningCircle } from '@phosphor-icons/vue';
import type { ErgonomicFinding } from '@furni/shared';

/**
 * Замечания по эргономике.
 *
 * Свой блок у края сцены, а не строка в колонке каталога: замечания
 * относятся к расстановке, а не к выбору товара, и по тапу подсвечивают
 * объект в сцене — рядом с ней им и место.
 *
 * Показываются списком, а не всплывающим окном: это подсказки, а не
 * ошибки, и перебивать ими расстановку нельзя. Тап по замечанию
 * подсвечивает виновников — иначе «проход между рядами 700 мм»
 * приходится искать глазами по всей кухне.
 */
const props = defineProps<{ findings: readonly ErgonomicFinding[] }>();
const emit = defineEmits<{ highlight: [readonly string[]] }>();

const open = ref(true);

const warnings = computed(
  () => props.findings.filter((finding) => finding.severity === 'warning').length,
);
</script>

<template>
  <section v-if="props.findings.length > 0" class="dock" :class="{ 'dock--open': open }">
    <button type="button" class="dock__head" :aria-expanded="open" @click="open = !open">
      <PhWarningCircle
        :size="15"
        weight="regular"
        class="dock__icon"
        :class="{ 'dock__icon--warn': warnings > 0 }"
      />
      <span class="dock__title">Эргономика</span>
      <span class="dock__count" :class="{ 'dock__count--warn': warnings > 0 }">
        {{ props.findings.length }}
      </span>
      <PhCaretDown
        :size="13"
        weight="bold"
        class="dock__chevron"
        :class="{ 'dock__chevron--open': open }"
      />
    </button>

    <ul v-if="open" class="dock__list scroll-thin">
      <li v-for="finding in props.findings" :key="finding.code + finding.instanceIds.join()">
        <button
          type="button"
          class="finding"
          :class="`finding--${finding.severity}`"
          @click="emit('highlight', finding.instanceIds)"
        >
          {{ finding.message }}
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
/**
 * Док прижат к левому нижнему углу сцены и не растёт выше половины
 * её высоты: сцена важнее списка замечаний.
 */
.dock {
  position: absolute;
  left: var(--gap-3);
  bottom: var(--gap-3);
  z-index: 2;
  width: min(296px, calc(100% - var(--gap-3) * 2));
  max-height: min(46%, 380px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
  background: var(--c-bg);
  box-shadow: var(--sh-lg);
  overflow: hidden;
}

.dock__head {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: var(--gap-2);
  align-items: center;
  flex: none;
  padding: 10px 12px;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.dock--open .dock__head {
  border-bottom: 1px solid var(--c-line);
}

.dock__icon {
  color: var(--c-text-faint);
}

.dock__icon--warn {
  color: var(--c-danger);
}

.dock__title {
  font-size: var(--t-md);
  font-weight: 600;
  color: var(--c-text);
}

.dock__count {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: var(--r-pill);
  background: var(--c-bg-active);
  color: var(--c-text-muted);
  font-size: var(--t-xs);
  text-align: center;
}

.dock__count--warn {
  background: var(--c-danger-soft);
  color: var(--c-danger);
}

.dock__chevron {
  color: var(--c-text-faint);
  transition: transform 0.18s var(--ease);
}

.dock__chevron--open {
  transform: rotate(180deg);
}

.dock__list {
  overflow-y: auto;
  margin: 0;
  padding: var(--gap-2);
  list-style: none;
  display: grid;
  gap: 5px;
}

/* Сами замечания оставлены как были: цветная полоса слева читается
   с одного взгляда, и менять то, что работает, незачем */
.finding {
  width: 100%;
  padding: 7px 9px;
  border: 0;
  border-left: 3px solid var(--c-line-strong);
  border-radius: 0 var(--r-sm) var(--r-sm) 0;
  background: var(--c-bg-sunken);
  font: inherit;
  font-size: var(--t-xs);
  line-height: 1.4;
  text-align: left;
  color: var(--c-text-muted);
  cursor: pointer;
  transition: background-color 0.13s var(--ease);
}

.finding:hover {
  background: var(--c-bg-active);
}

.finding--warning {
  border-left-color: var(--c-danger);
  background: var(--c-danger-soft);
  color: #7a2b22;
}

.finding--note {
  border-left-color: #e0a04a;
}

/* Узкая сцена: док во всю её ширину, иначе он перекрывает модель */
@media (max-width: 900px) {
  .dock {
    left: var(--gap-2);
    right: var(--gap-2);
    width: auto;
  }
}
</style>
