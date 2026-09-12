<script setup lang="ts">
import { ref } from 'vue';
import type { ErgonomicFinding } from '@furni/shared';

/**
 * Замечания по эргономике.
 *
 * Показываются списком, а не всплывающим окном: это подсказки, а не
 * ошибки, и перебивать ими расстановку нельзя. Тап по замечанию
 * подсвечивает виновников — иначе «проход между рядами 700 мм»
 * приходится искать глазами по всей кухне.
 */
const props = defineProps<{ findings: readonly ErgonomicFinding[] }>();
const emit = defineEmits<{ highlight: [readonly string[]] }>();

const open = ref(true);

const warnings = () => props.findings.filter((finding) => finding.severity === 'warning').length;
</script>

<template>
  <section v-if="props.findings.length > 0" class="ergo">
    <button type="button" class="ergo__head" @click="open = !open">
      <span class="ergo__title">Эргономика</span>
      <span class="ergo__count" :class="{ 'ergo__count--warn': warnings() > 0 }">
        {{ props.findings.length }}
      </span>
      <span class="ergo__chevron" :class="{ 'ergo__chevron--open': open }">⌄</span>
    </button>

    <ul v-if="open" class="ergo__list">
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
.ergo {
  flex: none;
  border-top: 1px solid #e5e7ec;
  background: #fff;
  max-height: 40%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.ergo__head {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 8px;
  align-items: center;
  padding: 9px 12px;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
  text-align: left;
}
.ergo__title {
  font-size: 12px;
  font-weight: 600;
}
.ergo__count {
  min-width: 18px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #eef1f5;
  color: #6b7280;
  font-size: 11px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.ergo__count--warn {
  background: #fef3f2;
  color: #b42318;
}
.ergo__chevron {
  font-size: 12px;
  color: #8a909b;
  transition: transform 0.15s;
}
.ergo__chevron--open {
  transform: rotate(180deg);
}
.ergo__list {
  overflow-y: auto;
  margin: 0;
  padding: 0 12px 12px;
  list-style: none;
  display: grid;
  gap: 5px;
}
.finding {
  width: 100%;
  padding: 7px 9px;
  border: 0;
  border-left: 3px solid #d5d8dd;
  border-radius: 0 7px 7px 0;
  background: #f7f8fa;
  font: inherit;
  font-size: 11px;
  line-height: 1.35;
  text-align: left;
  color: #4b5262;
  cursor: pointer;
}
.finding:hover {
  background: #eef1f5;
}
.finding--warning {
  border-left-color: #d92d20;
  background: #fef6f5;
  color: #7a2b22;
}
.finding--note {
  border-left-color: #f0a92c;
}
</style>
