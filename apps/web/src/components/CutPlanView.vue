<script setup lang="ts">
import { computed } from 'vue';
import {
  SHEET_HEIGHT_MM,
  SHEET_WIDTH_MM,
  TRIM_MM,
  planCut,
  type CatalogMaterial,
  type CatalogProduct,
  type Placement,
} from '@furni/shared';

/**
 * Карта раскроя расставленной кухни.
 *
 * Показывается схемой листа, а не только таблицей: по таблице
 * невозможно увидеть, что деталь не влезла или что лист занят
 * наполовину. Схема и таблица считаются одной функцией — расхождения
 * между картинкой и списком быть не может.
 */
const props = defineProps<{
  placements: readonly Placement[];
  products: ReadonlyMap<string, CatalogProduct>;
  materials: ReadonlyMap<string, CatalogMaterial>;
}>();

const emit = defineEmits<{ close: [] }>();

const plan = computed(() => planCut(props.placements, props.products));

/** Сводка по деталям: одинаковые складываются в одну строку. */
const summary = computed(() => {
  const rows = new Map<
    string,
    { name: string; material: string; widthMm: number; heightMm: number; thicknessMm: number; count: number }
  >();

  for (const sheet of plan.value.sheets) {
    for (const placed of sheet.parts) {
      const { part } = placed;
      const key = `${part.material}|${part.thicknessMm}|${part.name}|${part.widthMm}x${part.heightMm}`;
      const row = rows.get(key);
      if (row) row.count += 1;
      else rows.set(key, { ...part, count: 1 });
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.count - a.count || b.widthMm * b.heightMm - a.widthMm * a.heightMm,
  );
});

const sheetCount = computed(() => plan.value.sheets.length);

function materialName(code: string): string {
  return props.materials.get(code)?.name ?? code;
}

/** Цвет детали на схеме: по материалу, чтобы лист читался с одного взгляда. */
function fill(code: string): string {
  const material = props.materials.get(code);
  if (!material) return '#dfe3e8';
  const [r, g, b] = material.baseColorFactor;
  const channel = (value: number) => Math.round(255 * value ** (1 / 2.2));
  return `rgb(${channel(r)} ${channel(g)} ${channel(b)})`;
}

/** Подпись помещается не на всякую деталь: на узкой она превращается в кашу. */
function fits(widthMm: number, heightMm: number): boolean {
  return widthMm >= 260 && heightMm >= 150;
}
</script>

<template>
  <div class="cut">
    <header class="cut__head">
      <div>
        <h2 class="cut__title">Карта раскроя</h2>
        <p class="cut__meta">
          {{ plan.totalParts }} деталей · {{ sheetCount }}
          {{ sheetCount === 1 ? 'лист' : 'листов' }} {{ SHEET_WIDTH_MM }}×{{ SHEET_HEIGHT_MM }} ·
          загрузка {{ Math.round(plan.usage * 100) }}%
        </p>
      </div>
      <button type="button" class="cut__close" @click="emit('close')">Закрыть</button>
    </header>

    <p v-if="plan.totalParts === 0" class="cut__empty">
      В сцене нет изделий, которые пилят из плиты. Поставьте корпусную мебель или кухонные
      модули.
    </p>

    <p v-if="plan.oversized.length > 0" class="cut__warning">
      Не помещается на лист: {{ plan.oversized.map((part) => part.name).join(', ') }}. Такие
      детали заказывают отдельно.
    </p>

    <div class="cut__body">
      <section v-for="sheet in plan.sheets" :key="`${sheet.material}-${sheet.thicknessMm}-${sheet.index}`" class="sheet">
        <h3 class="sheet__title">
          Лист {{ sheet.index }} · {{ materialName(sheet.material) }}
          {{ sheet.thicknessMm }} мм
          <span class="sheet__usage">загрузка {{ Math.round(sheet.usage * 100) }}%</span>
        </h3>

        <svg
          class="sheet__plan"
          :viewBox="`0 0 ${SHEET_WIDTH_MM} ${SHEET_HEIGHT_MM}`"
          role="img"
          :aria-label="`Лист ${sheet.index}`"
        >
          <rect
            :width="SHEET_WIDTH_MM"
            :height="SHEET_HEIGHT_MM"
            fill="#f4f5f7"
            stroke="#c8cdd6"
            stroke-width="6"
          />
          <g :transform="`translate(${TRIM_MM} ${TRIM_MM})`">
            <g v-for="(placed, index) in sheet.parts" :key="index">
              <rect
                :x="placed.xMm"
                :y="placed.yMm"
                :width="placed.widthMm"
                :height="placed.heightMm"
                :fill="fill(placed.part.material)"
                stroke="#5a6270"
                stroke-width="3"
              />
              <text
                v-if="fits(placed.widthMm, placed.heightMm)"
                :x="placed.xMm + placed.widthMm / 2"
                :y="placed.yMm + placed.heightMm / 2"
                text-anchor="middle"
                font-size="54"
                fill="#22262d"
              >
                <tspan :x="placed.xMm + placed.widthMm / 2" dy="-8">{{ placed.part.name }}</tspan>
                <tspan :x="placed.xMm + placed.widthMm / 2" dy="62">
                  {{ placed.part.widthMm }}×{{ placed.part.heightMm }}
                </tspan>
              </text>
            </g>
          </g>
        </svg>
      </section>

      <section v-if="summary.length > 0" class="parts">
        <h3 class="parts__title">Спецификация</h3>
        <table class="parts__table">
          <thead>
            <tr>
              <th>Деталь</th>
              <th>Материал</th>
              <th>Размер, мм</th>
              <th>Толщина</th>
              <th>Кол-во</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in summary" :key="index">
              <td>{{ row.name }}</td>
              <td>{{ materialName(row.material) }}</td>
              <td class="num">{{ row.widthMm }} × {{ row.heightMm }}</td>
              <td class="num">{{ row.thicknessMm }}</td>
              <td class="num">{{ row.count }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cut {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  background: #fff;
}
.cut__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid #e5e7ec;
}
.cut__title {
  margin: 0;
  font-size: 16px;
}
.cut__meta {
  margin: 3px 0 0;
  font-size: 12px;
  color: #6b7280;
  font-variant-numeric: tabular-nums;
}
.cut__close {
  padding: 6px 12px;
  border: 1px solid #d5d8dd;
  border-radius: 7px;
  background: #fff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.cut__empty,
.cut__warning {
  margin: 16px 18px 0;
  padding: 9px 12px;
  border-radius: 9px;
  font-size: 12px;
  line-height: 1.4;
}
.cut__empty {
  background: #f4f5f7;
  color: #6b7280;
}
.cut__warning {
  background: #fef3f2;
  color: #b42318;
}
.cut__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px 24px;
  display: grid;
  gap: 20px;
}
.sheet__title {
  margin: 0 0 7px;
  font-size: 12px;
  font-weight: 600;
}
.sheet__usage {
  margin-left: 8px;
  font-weight: 400;
  color: #8a909b;
  font-variant-numeric: tabular-nums;
}
.sheet__plan {
  display: block;
  width: 100%;
  height: auto;
  max-width: 900px;
}
.parts__title {
  margin: 0 0 7px;
  font-size: 12px;
  font-weight: 600;
}
.parts__table {
  border-collapse: collapse;
  font-size: 12px;
  max-width: 900px;
  width: 100%;
}
.parts__table th,
.parts__table td {
  padding: 5px 9px;
  border-bottom: 1px solid #eceef1;
  text-align: left;
}
.parts__table th {
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8a909b;
  font-weight: 600;
}
.num {
  font-variant-numeric: tabular-nums;
}
</style>
