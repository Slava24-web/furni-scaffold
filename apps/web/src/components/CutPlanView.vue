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

/** Поле вокруг листа под выносные размеры. */
const MARGIN_MM = 320;

/**
 * Размерные линии по краям листа.
 *
 * Раскрой читают с линейкой в руках: подписи внутри детали говорят, что
 * это за деталь, а размерные линии по краю — где именно её резать.
 * Строятся по границам деталей, а не по каждой отдельно: у деталей,
 * выстроенных в ряд, границы общие, и десять одинаковых стрелок вместо
 * одной только мешают.
 */
function edges(values: readonly { from: number; to: number }[]): { from: number; to: number }[] {
  const bounds = new Set<number>();
  for (const value of values) {
    bounds.add(Math.round(value.from));
    bounds.add(Math.round(value.to));
  }

  const sorted = [...bounds].sort((a, b) => a - b);
  const spans: { from: number; to: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    spans.push({ from: sorted[i - 1]!, to: sorted[i]! });
  }
  // Слишком узкие промежутки — это пропилы, их не подписывают
  return spans.filter((span) => span.to - span.from >= 60);
}

function horizontalBands(sheet: { parts: readonly { xMm: number; widthMm: number }[] }) {
  return edges(sheet.parts.map((placed) => ({ from: placed.xMm, to: placed.xMm + placed.widthMm })));
}

function verticalBands(sheet: { parts: readonly { yMm: number; heightMm: number }[] }) {
  return edges(sheet.parts.map((placed) => ({ from: placed.yMm, to: placed.yMm + placed.heightMm })));
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
          :viewBox="`${-MARGIN_MM} ${-MARGIN_MM} ${SHEET_WIDTH_MM + MARGIN_MM * 2} ${SHEET_HEIGHT_MM + MARGIN_MM * 2}`"
          role="img"
          :aria-label="`Лист ${sheet.index}`"
        >
          <defs>
            <marker
              :id="`tick-${sheet.material}-${sheet.thicknessMm}-${sheet.index}`"
              markerWidth="10"
              markerHeight="10"
              refX="5"
              refY="5"
              orient="auto"
            >
              <path d="M 9 2 L 2 5 L 9 8 z" fill="#5a6270" />
            </marker>
          </defs>

          <rect
            :width="SHEET_WIDTH_MM"
            :height="SHEET_HEIGHT_MM"
            fill="#f4f5f7"
            stroke="#c8cdd6"
            stroke-width="6"
          />

          <!-- Габарит листа: внешние линии со стрелками -->
          <g class="dim">
            <line
              :x1="0"
              :y1="-MARGIN_MM + 110"
              :x2="SHEET_WIDTH_MM"
              :y2="-MARGIN_MM + 110"
              :marker-start="`url(#tick-${sheet.material}-${sheet.thicknessMm}-${sheet.index})`"
              :marker-end="`url(#tick-${sheet.material}-${sheet.thicknessMm}-${sheet.index})`"
            />
            <text :x="SHEET_WIDTH_MM / 2" :y="-MARGIN_MM + 70" text-anchor="middle">
              {{ SHEET_WIDTH_MM }}
            </text>
            <line
              :x1="-MARGIN_MM + 110"
              :y1="0"
              :x2="-MARGIN_MM + 110"
              :y2="SHEET_HEIGHT_MM"
              :marker-start="`url(#tick-${sheet.material}-${sheet.thicknessMm}-${sheet.index})`"
              :marker-end="`url(#tick-${sheet.material}-${sheet.thicknessMm}-${sheet.index})`"
            />
            <text
              :x="-MARGIN_MM + 70"
              :y="SHEET_HEIGHT_MM / 2"
              text-anchor="middle"
              :transform="`rotate(-90 ${-MARGIN_MM + 70} ${SHEET_HEIGHT_MM / 2})`"
            >
              {{ SHEET_HEIGHT_MM }}
            </text>
          </g>

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

            <!-- Размеры по краям: где именно резать лист -->
            <g class="dim">
              <g v-for="band in horizontalBands(sheet)" :key="`h${band.from}`">
                <line
                  :x1="band.from"
                  :y1="-60"
                  :x2="band.to"
                  :y2="-60"
                  :marker-start="`url(#tick-${sheet.material}-${sheet.thicknessMm}-${sheet.index})`"
                  :marker-end="`url(#tick-${sheet.material}-${sheet.thicknessMm}-${sheet.index})`"
                />
                <text :x="(band.from + band.to) / 2" :y="-80" text-anchor="middle">
                  {{ band.to - band.from }}
                </text>
              </g>

              <g v-for="band in verticalBands(sheet)" :key="`v${band.from}`">
                <line
                  :x1="-60"
                  :y1="band.from"
                  :x2="-60"
                  :y2="band.to"
                  :marker-start="`url(#tick-${sheet.material}-${sheet.thicknessMm}-${sheet.index})`"
                  :marker-end="`url(#tick-${sheet.material}-${sheet.thicknessMm}-${sheet.index})`"
                />
                <text
                  :x="-80"
                  :y="(band.from + band.to) / 2"
                  text-anchor="middle"
                  :transform="`rotate(-90 ${-80} ${(band.from + band.to) / 2})`"
                >
                  {{ band.to - band.from }}
                </text>
              </g>
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
.dim line {
  stroke: #5a6270;
  stroke-width: 4;
}
.dim text {
  font-size: 62px;
  fill: #5a6270;
  font-variant-numeric: tabular-nums;
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
