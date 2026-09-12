<script setup lang="ts">
import { ref } from 'vue';
import type { SceneEstimate } from '@furni/shared';
import { formatPrice } from '../lib/money';

/**
 * Предварительная смета сцены.
 *
 * Цифра считается на клиенте ради мгновенного отклика: меняешь отделку —
 * сразу видишь цену. В заявку она не идёт, итог пересчитывает сервер
 * по правилам тенанта (CLAUDE.md, правило 4). Об этом сказано прямо
 * в панели, иначе пользователь примет предварительную цену за итоговую.
 */
const props = defineProps<{ estimate: SceneEstimate }>();

const expanded = ref(false);
</script>

<template>
  <section class="estimate">
    <button
      type="button"
      class="estimate__summary"
      :aria-expanded="expanded"
      :disabled="props.estimate.positions === 0"
      @click="expanded = !expanded"
    >
      <span class="estimate__caption">
        Смета
        <span class="estimate__count">{{ props.estimate.positions }} поз.</span>
      </span>
      <span class="estimate__total">{{ formatPrice(props.estimate.totalCents) }}</span>
      <span class="estimate__chevron" :class="{ 'estimate__chevron--open': expanded }">⌃</span>
    </button>

    <div v-if="expanded" class="estimate__body">
      <ul class="lines">
        <li v-for="line in props.estimate.lines" :key="line.key" class="line">
          <span class="line__main">
            <span class="line__name">{{ line.name }}</span>
            <span v-if="line.finish.length > 0" class="line__finish">
              {{ line.finish.map((part) => `${part.label}: ${part.material}`).join(' · ') }}
            </span>
          </span>
          <span class="line__qty">×{{ line.quantity }}</span>
          <span class="line__sum">{{ formatPrice(line.totalCents) }}</span>
        </li>
      </ul>

      <p v-if="props.estimate.unknownSkus.length > 0" class="estimate__warning">
        Нет в каталоге, цена не учтена: {{ props.estimate.unknownSkus.join(', ') }}
      </p>

      <p class="estimate__note">
        Предварительный расчёт. Итоговая цена считается на сервере по правилам
        магазина и может отличаться.
      </p>
    </div>
  </section>
</template>

<style scoped>
.estimate {
  flex: none;
  border-top: 1px solid #e5e7ec;
  background: #fff;
}
.estimate__summary {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 0;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.estimate__summary:disabled {
  cursor: default;
  opacity: 0.55;
}
.estimate__caption {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
}
.estimate__count {
  font-size: 11px;
  font-weight: 400;
  color: #8a909b;
  font-variant-numeric: tabular-nums;
}
.estimate__total {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.estimate__chevron {
  display: inline-block;
  width: 12px;
  color: #8a909b;
  transform: rotate(180deg);
  transition: transform 0.15s ease;
}
.estimate__chevron--open {
  transform: rotate(0deg);
}
.estimate__body {
  max-height: 40vh;
  overflow-y: auto;
  padding: 0 14px 12px;
  border-top: 1px solid #f0f1f4;
}
.lines {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}
.line {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}
.line__main {
  display: grid;
  gap: 1px;
  min-width: 0;
}
.line__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.line__finish {
  font-size: 11px;
  color: #8a909b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.line__qty,
.line__sum {
  font-variant-numeric: tabular-nums;
}
.line__qty {
  color: #8a909b;
}
.line__sum {
  font-weight: 600;
}
.estimate__warning {
  margin: 10px 0 0;
  padding: 7px 9px;
  border-radius: 8px;
  background: #fffaeb;
  color: #93601a;
  font-size: 11px;
  line-height: 1.35;
}
.estimate__note {
  margin: 10px 0 0;
  font-size: 10px;
  line-height: 1.4;
  color: #8a909b;
}
</style>
