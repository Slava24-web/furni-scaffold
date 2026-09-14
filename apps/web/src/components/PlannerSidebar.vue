<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  CatalogProduct,
  FloorFinish,
  KitchenTemplate,
  SceneEstimate,
} from '@furni/shared';
import CatalogPanel from './CatalogPanel.vue';
import TemplatePanel from './TemplatePanel.vue';
import SurfacePanel from './SurfacePanel.vue';
import EstimatePanel from './EstimatePanel.vue';

/**
 * Левая колонка планировщика.
 *
 * Раньше здесь стояли друг на друге четыре сворачивающихся блока:
 * каталог, шаблоны, эргономика, пол, а под ними смета. Все с одинаковым
 * заголовком-полоской, все борются за одну и ту же высоту, и каталог —
 * то, ради чего в колонку и смотрят, — получал остаток.
 *
 * Теперь три вкладки на одну область. Каталог занимает колонку целиком,
 * шаблоны разворачиваются во весь рост, а смета закреплена внизу как
 * итог: она нужна всегда и не должна уезжать вместе с прокруткой.
 *
 * Замечания по эргономике уехали из колонки к сцене: они относятся
 * к расстановке, а не к выбору товара.
 */
const props = defineProps<{
  dragging: CatalogProduct | null;
  templatesReady: boolean;
  placed: number;
  templateProblem: string | null;
  floorGroups: readonly { kind: string; floors: FloorFinish[] }[];
  floorSelected: string | null;
  wallGroups: readonly { kind: string; floors: FloorFinish[] }[];
  wallSelected: string | null;
  estimate: SceneEstimate;
}>();

const emit = defineEmits<{
  dragStart: [CatalogProduct, PointerEvent];
  applyTemplate: [KitchenTemplate];
  pickFloor: [string | null];
  pickWall: [string | null];
  order: [];
}>();

type Tab = 'catalog' | 'templates' | 'finish';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'templates', label: 'Шаблоны' },
  { id: 'catalog', label: 'Каталог' },
  { id: 'finish', label: 'Отделка' },
];

const tab = ref<Tab>('templates');

/**
 * Стрелками между вкладками, как того требует роль tablist.
 *
 * Три кнопки с ARIA дешевле готового компонента: заголовочная
 * библиотека тянет за собой свой рантайм, а экран планировщика
 * считается по бюджету (LOAD_BUDGETS).
 */
function onTabKey(event: KeyboardEvent, index: number): void {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
  if (step === 0) return;

  event.preventDefault();
  const next = TABS[(index + step + TABS.length) % TABS.length]!;
  if (next.id === 'finish' && !finishReady.value) return;

  tab.value = next.id;
  const list = (event.currentTarget as HTMLElement).parentElement;
  list?.querySelectorAll<HTMLButtonElement>('button')[TABS.indexOf(next)]?.focus();
}

/**
 * После того как кухня встала, вкладка сама переключается на каталог.
 *
 * Шаблон выбирают один раз в начале; дальше работают с товарами,
 * и оставлять пользователя на уже сделанном шаге значит заставлять
 * его искать, куда нажать дальше.
 */
watch(
  () => props.placed,
  (now, before) => {
    if (before === 0 && now > 0 && tab.value === 'templates') tab.value = 'catalog';
  },
);

/** Отделка пола выбирается только там, где есть пол. */
const finishReady = computed(() => props.floorGroups.length > 0 && props.templatesReady);
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar__tabs">
      <div class="tabs" role="tablist" aria-label="Разделы планировщика">
        <button
          v-for="(item, index) in TABS"
          :id="`tab-${item.id}`"
          :key="item.id"
          type="button"
          role="tab"
          class="tab"
          :class="{ 'tab--on': tab === item.id }"
          :aria-selected="tab === item.id"
          :aria-controls="`pane-${item.id}`"
          :tabindex="tab === item.id ? 0 : -1"
          :disabled="item.id === 'finish' && !finishReady"
          @click="tab = item.id"
          @keydown="onTabKey($event, index)"
        >
          {{ item.label }}
        </button>
      </div>

      <div
        id="pane-templates"
        class="pane"
        role="tabpanel"
        aria-labelledby="tab-templates"
        :hidden="tab !== 'templates'"
      >
        <TemplatePanel
          :ready="props.templatesReady"
          :problem="props.templateProblem"
          @apply="emit('applyTemplate', $event)"
        />
      </div>

      <div
        id="pane-catalog"
        class="pane"
        role="tabpanel"
        aria-labelledby="tab-catalog"
        :hidden="tab !== 'catalog'"
      >
        <CatalogPanel
          :dragging="props.dragging"
          @drag-start="(product, event) => emit('dragStart', product, event)"
        />
      </div>

      <div
        id="pane-finish"
        class="pane"
        role="tabpanel"
        aria-labelledby="tab-finish"
        :hidden="tab !== 'finish'"
      >
        <div class="finish scroll-thin">
          <SurfacePanel
            label="Пол"
            :groups="props.floorGroups"
            :selected="props.floorSelected"
            @pick="emit('pickFloor', $event)"
          />
          <SurfacePanel
            label="Стены"
            :groups="props.wallGroups"
            :selected="props.wallSelected"
            @pick="emit('pickWall', $event)"
          />
        </div>
      </div>
    </div>

    <EstimatePanel :estimate="props.estimate" @order="emit('order')" />
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: 312px;
  flex: none;
  min-height: 0;
  border-right: 1px solid var(--c-line);
  background: var(--c-bg-sunken);
}

.sidebar__tabs {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

/* --- Вкладки --- */
.tabs {
  display: flex;
  flex: none;
  gap: 2px;
  margin: var(--gap-3) var(--gap-3) 0;
  padding: 2px;
  border-radius: var(--r-md);
  background: var(--c-bg-active);
}

.tab {
  flex: 1;
  padding: 6px 4px;
  border: 0;
  border-radius: var(--r-sm);
  background: transparent;
  font: inherit;
  font-size: var(--t-md);
  color: var(--c-text-muted);
  cursor: pointer;
  transition: background-color 0.13s var(--ease), color 0.13s var(--ease);
}

.tab:hover:not(:disabled) {
  color: var(--c-text);
}

.tab:disabled {
  opacity: 0.4;
  cursor: default;
}

.tab--on {
  background: var(--c-bg);
  color: var(--c-text);
  font-weight: 500;
  box-shadow: var(--sh-sm);
}

/* На узком экране колонка забирала половину ширины: планировщик
   про сцену, а не про список */
@media (max-width: 1100px) {
  .sidebar {
    width: 268px;
  }
}

/* Пол и стены в одной вкладке: их выбирают вместе, и разносить
   по разным экранам значит заставлять сравнивать по памяти */
.finish {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  align-content: start;
  gap: var(--gap-5);
  padding: var(--gap-3);
}

/* --- Область вкладки --- */
.pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Неактивные вкладки остаются в разметке скрытыми; без этого правила
   display: flex перебивает [hidden], и три панели делят высоту колонки
   на три вместо того, чтобы одна занимала её целиком */
.pane[hidden] {
  display: none;
}

.pane:focus-visible {
  outline: none;
}
</style>
