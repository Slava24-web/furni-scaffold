<script setup lang="ts">
import { computed } from 'vue';
import { planGeometry, type CatalogProduct, type SceneDoc } from '@furni/shared';

/**
 * План сверху для замерщика и монтажника.
 *
 * По 3D не монтируют: на объект приходят с планом, где есть размеры,
 * привязки и отметки инженерии. Геометрия считается из того же
 * документа, что и сцена, — разойтись они не могут.
 */
const props = defineProps<{
  doc: SceneDoc;
  products: ReadonlyMap<string, CatalogProduct>;
}>();

const emit = defineEmits<{ close: [] }>();

const plan = computed(() => planGeometry(props.doc, props.products));

/** Поле вокруг плана под выносные размеры и подписи. */
const MARGIN_MM = 900;

const viewBox = computed(() => {
  const bounds = plan.value.bounds;
  if (!bounds) return '0 0 1000 1000';

  const x = bounds.minX - MARGIN_MM;
  const y = bounds.minY - MARGIN_MM;
  return `${x} ${y} ${bounds.maxX - bounds.minX + MARGIN_MM * 2} ${bounds.maxY - bounds.minY + MARGIN_MM * 2}`;
});

const path = (points: readonly { x: number; y: number }[]): string =>
  points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ') + ' Z';

const polyline = (points: readonly { x: number; y: number }[]): string =>
  points.map((point) => `${point.x},${point.y}`).join(' ');

/** Кегль подписи в миллиметрах плана. */
const LABEL_SIZE_MM = 95;

/** Короткое имя: полное не влезает в габарит модуля. */
function shortName(name: string): string {
  return name.replace(/^Кухня:\s*/i, '').replace(/^Техника\s*\/\s*/i, '');
}

/**
 * Подпись модуля.
 *
 * Имя ставится, только если оно влезает в габарит: наложившиеся подписи
 * делают верхний ряд нечитаемым. Не влезло — пишем ширину, монтажнику
 * она нужнее названия.
 */
function label(item: {
  name: string;
  widthMm: number;
  depthMm: number;
  role: string;
}): string | null {
  // Столешницу не подписывают: она накрывает весь ряд, и её подпись
  // ложится на подписи модулей под ней
  if (item.role === 'worktop') return null;
  if (Math.min(item.widthMm, item.depthMm) < 260) return null;

  const short = shortName(item.name);
  // Ширина строки на глаз: половина кегля на символ
  const needed = short.length * LABEL_SIZE_MM * 0.5;
  return needed <= item.widthMm ? short : String(item.widthMm);
}

const sortedItems = computed(() =>
  // Навесные рисуются поверх напольных: иначе пунктир теряется под ними
  [...plan.value.items].sort((a, b) => Number(a.mounted) - Number(b.mounted)),
);
</script>

<template>
  <div class="plan">
    <header class="plan__head">
      <div>
        <h2 class="plan__title">План сверху</h2>
        <p class="plan__meta">
          {{ plan.items.length }} изделий · {{ plan.services.length }} точек инженерии ·
          площадь {{ plan.areaSqm.toFixed(1) }} м²
        </p>
      </div>
      <button type="button" class="plan__close" @click="emit('close')">Закрыть</button>
    </header>

    <p v-if="!plan.bounds" class="plan__empty">
      Пустая сцена. Постройте помещение и расставьте мебель.
    </p>

    <div v-else class="plan__body">
      <svg class="plan__svg" :viewBox="viewBox" role="img" aria-label="План помещения">
        <!-- Стены сплошной заливкой: на плане они читаются массой -->
        <path
          v-for="wall in plan.walls"
          :key="wall.id"
          :d="path(wall.corners)"
          fill="#c9cdd4"
          stroke="#5a6270"
          stroke-width="12"
        />

        <!-- Проём — разрыв в стене; у двери ещё и дуга открывания -->
        <g v-for="opening in plan.openings" :key="opening.id">
          <path :d="path(opening.corners)" fill="#ffffff" stroke="#5a6270" stroke-width="8" />
          <polyline
            v-if="opening.arc.length > 0"
            :points="polyline(opening.arc)"
            fill="none"
            stroke="#8a909b"
            stroke-width="8"
            stroke-dasharray="60 40"
          />
        </g>

        <!-- Мебель: напольная сплошной линией, навесная пунктиром -->
        <g v-for="item in sortedItems" :key="item.instanceId">
          <path
            :d="path(item.corners)"
            :fill="item.mounted ? 'none' : '#f2f3f5'"
            stroke="#3d4450"
            stroke-width="10"
            :stroke-dasharray="item.mounted ? '90 60' : undefined"
          />
          <text
            v-if="label(item)"
            :x="item.labelAt.x"
            :y="item.labelAt.y"
            text-anchor="middle"
            dominant-baseline="middle"
            :font-size="LABEL_SIZE_MM"
            fill="#3d4450"
          >
            {{ label(item) }}
          </text>
        </g>

        <!-- Размеры сторон помещения -->
        <g v-for="dimension in plan.dimensions" :key="dimension.id" class="dim">
          <line
            :x1="dimension.start.x"
            :y1="dimension.start.y"
            :x2="dimension.end.x"
            :y2="dimension.end.y"
          />
          <text
            :x="dimension.labelAt.x"
            :y="dimension.labelAt.y"
            text-anchor="middle"
            dominant-baseline="middle"
          >
            {{ dimension.clearLengthMm }}
          </text>
        </g>

        <!-- Инженерия: кружок с буквой, как на строительном плане -->
        <g v-for="service in plan.services" :key="service.id">
          <circle
            :cx="service.position.x"
            :cy="service.position.y"
            r="150"
            :fill="service.colour"
            stroke="#ffffff"
            stroke-width="16"
          />
          <text
            :x="service.position.x"
            :y="service.position.y"
            text-anchor="middle"
            dominant-baseline="middle"
            font-size="150"
            fill="#ffffff"
          >
            {{ service.short }}
          </text>
        </g>
      </svg>

      <section v-if="plan.services.length > 0" class="legend">
        <h3 class="legend__title">Инженерия</h3>
        <ul class="legend__items">
          <li v-for="service in plan.services" :key="service.id">
            <span class="legend__dot" :style="{ background: service.colour }" />
            {{ service.name }} · отметка {{ service.heightMm }} мм
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.plan {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  background: #fff;
}
.plan__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid #e5e7ec;
}
.plan__title {
  margin: 0;
  font-size: 16px;
}
.plan__meta {
  margin: 3px 0 0;
  font-size: 12px;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}
.plan__close {
  padding: 6px 12px;
  border: 1px solid #d5d8dd;
  border-radius: 7px;
  background: #fff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.plan__empty {
  margin: 16px 18px;
  padding: 9px 12px;
  border-radius: 9px;
  background: #f4f5f7;
  color: #6b7280;
  font-size: 12px;
}
.plan__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 18px 24px;
  display: grid;
  gap: 16px;
}
.plan__svg {
  display: block;
  width: 100%;
  height: auto;
  max-width: 960px;
  background: #fff;
}
.dim line {
  stroke: #2f6fed;
  stroke-width: 6;
}
.dim text {
  font-size: 120px;
  fill: #2f6fed;
  font-variant-numeric: tabular-nums;
}
.legend__title {
  margin: 0 0 6px;
  font-size: 12px;
}
.legend__items {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  color: #4b5262;
}
.legend__dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 6px;
  border-radius: 50%;
  vertical-align: middle;
}
</style>
