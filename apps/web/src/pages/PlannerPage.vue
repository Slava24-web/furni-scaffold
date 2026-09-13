<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  buildKitchen,
  createRectangularRoom,
  checkErgonomics,
  checkServices,
  estimateScene,
  placementPriceCents,
  rectangularExtent,
  type CatalogProduct,
  type DeviceTier,
  type Placement,
} from '@furni/shared';
import SceneCanvas from '../components/SceneCanvas.vue';
import CatalogPanel from '../components/CatalogPanel.vue';
import RoomToolbar from '../components/RoomToolbar.vue';
import ObjectInspector from '../components/ObjectInspector.vue';
import EstimatePanel from '../components/EstimatePanel.vue';
import FloorPanel from '../components/FloorPanel.vue';
import ErgonomicsPanel from '../components/ErgonomicsPanel.vue';
import DimensionEditor from '../components/DimensionEditor.vue';
import OpeningInspector from '../components/OpeningInspector.vue';
import { conflictMessage } from '../lib/conflictMessage';

/**
 * Раскрой и форма заявки грузятся по требованию.
 *
 * Обе страницы открывают редко, а их код тянет за собой укладку деталей
 * и клиент API. В первом кадре планировщика им делать нечего — бюджет
 * TTFF считается по нему (LOAD_BUDGETS.timeToFirstFrameMs).
 */
const CutPlanView = defineAsyncComponent(() => import('../components/CutPlanView.vue'));
const LeadForm = defineAsyncComponent(() => import('../components/LeadForm.vue'));
const PlanView = defineAsyncComponent(() => import('../components/PlanView.vue'));
import { useCatalogDrag } from '../composables/useCatalogDrag';
import { usePlannerTools } from '../composables/usePlannerTools';
import { useOpeningEditing } from '../composables/useOpeningEditing';
import { installTestingApi, uninstallTestingApi } from '../dev/testingApi';
import { useCatalogStore } from '../stores/catalog';
import { useSceneStore } from '../stores/scene';
import type { KitchenLayoutKind } from '@furni/shared';

const route = useRoute();
const scene = useSceneStore();
const catalog = useCatalogStore();
const canvas = ref<InstanceType<typeof SceneCanvas> | null>(null);

/** Карта раскроя поверх сцены: отдельная страница увела бы от планировки. */
const cutOpen = ref(false);
/** План сверху: отдельная страница для замерщика и монтажника. */
const planOpen = ref(false);
/** Форма заявки: показывается поверх сцены, планировку не закрывает. */
const leadOpen = ref(false);

const TIERS: readonly DeviceTier[] = ['low', 'mid', 'high', 'desktop'];

/** Перф-гейт открывает /planner?forceTier=mid&perf=1 — тир задаётся из адреса. */
const forceTier = computed<DeviceTier | undefined>(() => {
  const raw = route.query.forceTier;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return TIERS.find((t) => t === value);
});

const testingEnabled = computed(() => import.meta.env.DEV || route.query.perf === '1');

/**
 * Инструменты планировки: режим, стены, проёмы, инженерия.
 * Своя обязанность — свой композабл (apps/web/src/composables).
 */
const {
  mode,
  drawing,
  serviceKind,
  hint: toolHint,
  setMode,
  finishDrawing,
  pickServiceKind,
  onFloorTap,
  onAim,
} = usePlannerTools({ viewer: () => canvas.value?.viewer });

const drag = useCatalogDrag({
  isOverScene: (x, y) => isInsideScene(x, y),
  onDrop: (product, x, y) => dropProduct(product, x, y),
  onMoveOverScene: (product, x, y) => void canvas.value?.updatePreview(product, x, y),
  onLeaveScene: () => canvas.value?.hidePreview(),
});

function sceneRect(): DOMRect | null {
  return canvas.value?.containerRef?.getBoundingClientRect() ?? null;
}

function isInsideScene(clientX: number, clientY: number): boolean {
  const rect = sceneRect();
  if (!rect) return false;
  return (
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  );
}

/** Сброс товара из каталога: точка отпускания проецируется на пол. */
function dropProduct(product: CatalogProduct, clientX: number, clientY: number): void {
  const point = canvas.value?.snapDropPoint(product, clientX, clientY);
  canvas.value?.hidePreview();
  if (!point) return;

  const placement = scene.addPlacement(product, point, point.rotationY);
  canvas.value?.select(placement.instanceId);
}

function createRoom(size: { widthMm: number; depthMm: number }): void {
  scene.setRoom(createRectangularRoom(size));
  mode.value = 'select';
  // Показать помещение целиком: иначе камера остаётся там, где была,
  // и пользователь видит глухую коробку снаружи
  canvas.value?.focusArea(
    { x: 0, z: 0 },
    Math.max(size.widthMm, size.depthMm) * 0.75,
  );
}

/**
 * Готовый сценарий кухни.
 *
 * Раскладка добавляется к сцене одним шагом истории: передумавшему
 * достаточно отмены, а разбирать её по модулю никто не станет.
 */
function assembleKitchen(kind: KitchenLayoutKind): void {
  const [room] = scene.doc.rooms;
  if (!room) {
    kitchenProblem.value = 'Сначала постройте помещение';
    return;
  }

  const result = buildKitchen(kind, room, catalog.products);
  kitchenProblem.value = result.problems[0] ?? null;
  scene.addPlacements(result.placements);
}

const kitchenProblem = ref<string | null>(null);

/**
 * Проёмы и размерные линии: выбор, правка, открывание двери.
 * Своя обязанность — свой композабл (apps/web/src/composables).
 */
const openings = useOpeningEditing({
  sceneRect,
  viewer: () => canvas.value?.viewer,
  focusArea: (centre, radius) => canvas.value?.focusArea(centre, radius),
});

/** Есть ли помещение, размеры которого можно править. */
const editableRoom = computed(() => {
  const [room] = scene.doc.rooms;
  return room !== undefined && rectangularExtent(room) !== null;
});

/** Размещение выделенного объекта: по нему рисуется панель свойств. */
const selected = computed(() => {
  const id = canvas.value?.selectedId;
  return id ? scene.doc.placements.find((p) => p.instanceId === id) : undefined;
});

/**
 * Замечания по эргономике.
 *
 * Считаются на каждое изменение документа, а не по кнопке: правило,
 * о котором надо вспомнить и нажать, не работает.
 */
const ergonomics = computed(() => [
  ...checkErgonomics(scene.doc.placements, catalog.bySku),
  // Подключения проверяются вместе с эргономикой: и то и другое
  // всплывает на монтаже, когда кухня уже привезена
  ...checkServices(scene.doc.placements, catalog.bySku, scene.doc.services),
]);

/** Предварительная смета: считается на клиенте, итог — за сервером. */
const estimate = computed(() =>
  estimateScene(scene.doc.placements, catalog.bySku, catalog.materialByCode),
);

const selectedPrice = computed(() => {
  const placement = selected.value;
  const product = placement && catalog.bySku.get(placement.sku);
  return placement && product
    ? placementPriceCents(product, placement.options, catalog.materialByCode)
    : 0;
});

/**
 * Подсветка виновников замечания.
 *
 * Выделяется первый из них, остальные помечаются как конфликтующие:
 * выделение в сцене одно, а объяснить надо про пару.
 */
function highlightFinding(instanceIds: readonly string[]): void {
  const [first] = instanceIds;
  if (first) canvas.value?.select(first);
}

function updateSelected(patch: Partial<Placement>): void {
  const id = canvas.value?.selectedId;
  if (id) scene.updatePlacement(id, patch);
}

function deleteSelected(): void {
  const id = canvas.value?.selectedId;
  if (!id) return;
  canvas.value?.select(null);
  scene.removePlacement(id);
}

/** Конфликт важнее подсказки режима: он требует действия пользователя. */
const conflict = computed(() =>
  drag.product.value
    ? conflictMessage(canvas.value?.previewConflicts)
    : conflictMessage(canvas.value?.conflicts),
);

/**
 * Точные координаты постановки во время переноса.
 *
 * Показываются именно те значения, которые уйдут в документ после
 * привязки, а не координаты курсора: они различаются.
 */
const previewReadout = computed(() => {
  const point = canvas.value?.preview;
  if (!point) return null;

  const rotation = point.rotationDeg === 0 ? '' : `, поворот ${point.rotationDeg}°`;
  // Высота показывается, только когда объект поднят: на полу она шум
  const height = point.yMm === 0 ? '' : ` · высота ${point.yMm} мм`;
  return `X ${point.xMm} мм · Z ${point.zMm} мм${height}${rotation}`;
});

const hint = computed(() => {
  if (toolHint.value) return toolHint.value;
  if (kitchenProblem.value) return kitchenProblem.value;
  // Подсказка про размеры нужна, пока пользователь не занят объектом:
  // иначе о вводе точного размера он не догадается
  if (editableRoom.value && !selected.value) {
    return 'Тапните по размеру на полу, чтобы задать его точно';
  }
  return null;
});

onMounted(() => {
  if (!testingEnabled.value) return;
  installTestingApi(() => canvas.value?.viewer ?? null);
});

onBeforeUnmount(() => uninstallTestingApi());
</script>

<template>
  <main class="planner">
    <RoomToolbar
      :mode="mode"
      :service-kind="serviceKind"
      :drawing-active="drawing.active.value"
      :can-undo="scene.undoStack.length > 0"
      :can-redo="scene.redoStack.length > 0"
      @create-room="createRoom"
      @set-mode="setMode"
      @finish-drawing="finishDrawing"
      @clear-rooms="scene.clearRooms()"
      @undo="scene.undo()"
      @redo="scene.redo()"
      @show-cut="cutOpen = true"
      @show-plan="planOpen = true"
      @build-kitchen="assembleKitchen"
      @pick-service="pickServiceKind"
    />

    <PlanView
      v-if="planOpen"
      :doc="scene.doc"
      :products="catalog.bySku"
      @close="planOpen = false"
    />

    <CutPlanView
      v-if="cutOpen"
      :placements="scene.doc.placements"
      :products="catalog.bySku"
      :materials="catalog.materialByCode"
      @close="cutOpen = false"
    />

    <div class="planner__body">
      <div class="planner__sidebar">
        <CatalogPanel :dragging="drag.product.value" @drag-start="drag.start" />
        <ErgonomicsPanel :findings="ergonomics" @highlight="highlightFinding" />
        <FloorPanel
          v-if="scene.doc.rooms.length > 0"
          :groups="catalog.floorGroups"
          :selected="scene.doc.rooms[0]?.floorMaterialId ?? null"
          @pick="scene.setFloor"
        />
        <EstimatePanel :estimate="estimate" @order="leadOpen = true" />
      </div>

      <div class="planner__scene" :class="{ 'is-drop-target': drag.overScene.value }">
        <SceneCanvas
          ref="canvas"
          :force-tier="forceTier"
          :mode="mode"
          @floor-tap="onFloorTap"
          @floor-double-tap="finishDrawing"
          @dimension-tap="openings.onDimensionTap"
          @aim="onAim"
          @opening-tap="openings.selectOpening"
          @service-tap="scene.removeService"
        />
        <DimensionEditor
          v-if="openings.editedDimension.value"
          :key="openings.editedDimension.value.id"
          :value-mm="openings.editedDimension.value.valueMm"
          :x="openings.editedDimension.value.x"
          :y="openings.editedDimension.value.y"
          @apply="openings.applyDimension"
          @cancel="openings.editedDimension.value = null"
        />
        <OpeningInspector
          v-if="openings.selectedOpening.value"
          :opening="openings.selectedOpening.value"
          :materials="catalog.materialByCode"
          :open="openings.openingOpen.value"
          @update="openings.updateOpening"
          @remove="openings.removeOpening"
          @set-open="openings.setOpeningOpen"
        />
        <ObjectInspector
          v-else-if="selected"
          :placement="selected"
          :product="catalog.bySku.get(selected.sku)"
          :materials="catalog.materialByCode"
          :price-cents="selectedPrice"
          :conflicts="canvas?.conflicts"
          @update="updateSelected"
          @remove="deleteSelected"
          @set-doors="(open: boolean) => canvas?.setDoorsOpen(open)"
        />

        <LeadForm
          v-if="leadOpen"
          :doc="scene.doc"
          :client-total-cents="estimate.totalCents"
          @close="leadOpen = false"
        />

        <p v-if="conflict" class="planner__hint planner__hint--conflict">{{ conflict }}</p>
        <p v-else-if="previewReadout" class="planner__hint planner__hint--readout">
          {{ previewReadout }}
        </p>
        <p v-else-if="hint" class="planner__hint">{{ hint }}</p>
      </div>
    </div>

    <!-- Призрак под курсором: указательные события не рисуют его сами -->
    <div
      v-if="drag.product.value"
      class="ghost"
      :style="{ left: `${drag.ghostX.value}px`, top: `${drag.ghostY.value}px` }"
    >
      {{ drag.product.value.name }}
    </div>
  </main>
</template>

<style scoped>
.planner {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}
.planner__body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.planner__sidebar {
  display: flex;
  flex-direction: column;
  width: 300px;
  flex: none;
  min-height: 0;
  border-right: 1px solid #e5e7ec;
  background: #fbfbfc;
}
.planner__scene {
  position: relative;
  flex: 1;
  min-width: 0;
}
.planner__scene.is-drop-target::after {
  content: '';
  position: absolute;
  inset: 8px;
  border: 2px dashed #2f6fed;
  border-radius: 10px;
  pointer-events: none;
}
.planner__hint--conflict {
  background: rgb(217 45 32 / 0.92);
}
.planner__hint--readout {
  background: rgb(47 111 237 / 0.92);
  font-variant-numeric: tabular-nums;
}
.planner__hint {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  margin: 0;
  padding: 7px 14px;
  border-radius: 999px;
  background: rgb(17 20 24 / 0.82);
  color: #fff;
  font-size: 12px;
  pointer-events: none;
}
.ghost {
  position: fixed;
  z-index: 10;
  transform: translate(12px, 12px);
  padding: 6px 10px;
  border-radius: 8px;
  background: #2f6fed;
  color: #fff;
  font-size: 12px;
  pointer-events: none;
}
</style>
