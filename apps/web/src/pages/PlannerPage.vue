<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import {
  buildKitchen,
  createRectangularRoom,
  defaultStyle,
  checkErgonomics,
  checkServices,
  estimateScene,
  placementPriceCents,
  planDimensions,
  planOpening,
  resizeOpening,
  serviceInfo,
  snapToWall,
  randomUUID,
  rectangularExtent,
  resizeRoomWall,
  type CatalogProduct,
  type DeviceTier,
  type Opening,
  type Placement,
  type Wall,
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
import { useWallDrawing } from '../composables/useWallDrawing';
import { installTestingApi, uninstallTestingApi } from '../dev/testingApi';
import { useCatalogStore } from '../stores/catalog';
import { useSceneStore } from '../stores/scene';
import type { KitchenLayoutKind, ServicePointKind } from '@furni/shared';
import type { DimensionHit, FloorPoint, PlannerMode } from '../composables/useSceneEditing';

const route = useRoute();
const scene = useSceneStore();
const catalog = useCatalogStore();
const canvas = ref<InstanceType<typeof SceneCanvas> | null>(null);
const mode = ref<PlannerMode>('select');
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

const drawing = useWallDrawing({ onWall: (wall: Wall) => scene.addWall(wall) });

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

function setMode(next: PlannerMode): void {
  mode.value = next;
  if (next === 'draw-wall') drawing.start();
  else drawing.finish();
}

function finishDrawing(): void {
  drawing.finish();
  mode.value = 'select';
}

/**
 * Подсветка будущего проёма под указателем.
 *
 * Место считается той же функцией, что и вставка: подсветка обязана
 * показывать ровно тот прямоугольник, который получится после тапа.
 */
function onAim(point: FloorPoint | null): void {
  const viewer = canvas.value?.viewer;
  const [room] = scene.doc.rooms;
  const kind = mode.value === 'add-door' ? 'door' : mode.value === 'add-window' ? 'window' : null;

  if (!viewer || !room || !point || !kind) {
    viewer?.openings.previewAt(null, null, null);
    viewer?.invalidate();
    return;
  }

  const style = defaultStyle(kind);
  const plan = planOpening(room, { x: point.x, y: point.z }, style.widthMm);
  viewer.openings.previewAt(
    room,
    plan?.wall ?? null,
    plan
      ? {
          offsetMm: plan.offsetMm,
          widthMm: plan.widthMm,
          heightMm: style.heightMm,
          sillMm: style.sillHeightMm,
        }
      : null,
  );
  viewer.invalidate();
}

/**
 * Разметка инженерии.
 *
 * Вид точки выбирается в панели и остаётся выбранным: розетки ставят
 * пачкой, и переключаться на каждую значит удвоить число нажатий.
 */
const serviceKind = ref<ServicePointKind>('socket');

function pickServiceKind(kind: ServicePointKind): void {
  // Повторное нажатие на активный вид выходит из режима разметки
  if (mode.value === 'add-service' && serviceKind.value === kind) {
    mode.value = 'select';
    return;
  }
  serviceKind.value = kind;
  mode.value = 'add-service';
}

/** Точка ставится на ближайшую стену: инженерия живёт на стенах. */
function addService(point: FloorPoint): void {
  const [room] = scene.doc.rooms;
  if (!room) return;

  const info = serviceInfo(serviceKind.value);
  const snapped = snapToWall(room, { x: point.x, y: point.z });

  scene.addService({
    id: randomUUID(),
    kind: serviceKind.value,
    position: { x: Math.round(snapped.position.x), y: Math.round(snapped.position.y) },
    heightMm: info.heightMm,
    wallId: snapped.wallId,
    note: '',
  });
}

function onFloorTap(point: FloorPoint): void {
  if (mode.value === 'add-service') {
    addService(point);
    return;
  }
  if (mode.value === 'draw-wall') {
    if (drawing.addPoint(point)) mode.value = 'select';
    return;
  }
  if (mode.value === 'add-door' || mode.value === 'add-window') {
    insertOpening(point, mode.value === 'add-door' ? 'door' : 'window');
  }
}

/**
 * Проём ставится в ближайшую стену: пользователь целится в стену, а не
 * задаёт её идентификатор. Смещение центрируется по точке клика и
 * прижимается к границам стены, иначе дверь вылезет за её торец.
 */
function insertOpening(point: FloorPoint, kind: 'door' | 'window'): void {
  const [room] = scene.doc.rooms;
  if (!room) return;

  // Размеры берутся у изделия, а не задаются здесь: проём и то, что
  // в него встанет, обязаны совпадать с первого клика
  const style = defaultStyle(kind);
  const plan = planOpening(room, { x: point.x, y: point.z }, style.widthMm);
  if (!plan) return;

  canvas.value?.viewer?.openings.previewAt(null, null, null);
  scene.addOpening({
    id: randomUUID(),
    wallId: plan.wall.id,
    kind,
    offset: plan.offsetMm,
    width: plan.widthMm,
    height: style.heightMm,
    sillHeight: style.sillHeightMm,
    swingRadius: null,
    hinge: 'left',
    swingInward: true,
    sku: style.code,
    options: {},
  });
  mode.value = 'select';
}

/**
 * Правка размера помещения по размерной линии.
 *
 * Координаты тапа переводятся в систему области сцены: поле ввода лежит
 * в ней, а жест приходит в клиентских координатах окна.
 */
const editedDimension = ref<{ id: string; valueMm: number; x: number; y: number } | null>(null);

function onDimensionTap(hit: DimensionHit | null): void {
  const rect = sceneRect();
  if (!hit || !rect) {
    editedDimension.value = null;
    return;
  }
  editedDimension.value = {
    id: hit.id,
    valueMm: hit.lengthMm,
    x: hit.clientX - rect.left,
    y: hit.clientY - rect.top,
  };
}

function applyDimension(valueMm: number): void {
  const edited = editedDimension.value;
  const [room] = scene.doc.rooms;
  editedDimension.value = null;
  if (!edited || !room) return;

  const target = planDimensions(room).find((dimension) => dimension.id === edited.id)?.target;
  if (!target) return;

  const next =
    target.kind === 'wall'
      ? resizeRoomWall(room, target.wallId, valueMm)
      : resizeOpening(room, target.openingId, valueMm);
  // Отвергнутый размер не должен попадать в историю отмен пустым шагом
  if (next === room) return;

  scene.setRoom(next);
  // Ширина проёма кадрирование не меняет: помещение осталось прежним
  if (target.kind === 'opening') return;
  // Кадрирование по новым габаритам: выросшая стена уезжает за край
  // экрана, и пользователь не видит результата своего же ввода
  const extent = rectangularExtent(next);
  if (!extent) return;
  canvas.value?.focusArea(
    { x: (extent.minX + extent.maxX) / 2, z: (extent.minZ + extent.maxZ) / 2 },
    Math.max(extent.maxX - extent.minX, extent.maxZ - extent.minZ) * 0.75,
  );
}

/** Выбранный проём: по нему рисуется панель свойств двери или окна. */
const selectedOpeningId = ref<string | null>(null);

const selectedOpening = computed(() => {
  const id = selectedOpeningId.value;
  return id ? scene.doc.rooms[0]?.openings.find((opening) => opening.id === id) : undefined;
});

/**
 * Подсветка выбранного проёма.
 *
 * Тот же прямоугольник, что показывает будущее место: выделение должно
 * читаться одинаково и до вставки, и после неё.
 */
watch([selectedOpening, () => canvas.value?.viewer], ([opening, viewer]) => {
  if (!viewer) return;
  const [room] = scene.doc.rooms;
  const wall = room?.walls.find((candidate) => candidate.id === opening?.wallId);

  viewer.openings.previewAt(
    room ?? null,
    wall ?? null,
    opening
      ? {
          offsetMm: opening.offset,
          widthMm: opening.width,
          heightMm: opening.height,
          sillMm: opening.sillHeight,
        }
      : null,
  );
  viewer.invalidate();
});

function onOpeningTap(openingId: string | null): void {
  selectedOpeningId.value = openingId;
  openingOpen.value = openingId ? isOpeningOpen(openingId) : false;
}

/**
 * Распахнутая дверь — состояние вьюера, а не документа: это осмотр, а не
 * свойство планировки. Поэтому и панель спрашивает вьюер.
 */
const openingOpen = ref(false);

function isOpeningOpen(openingId: string): boolean {
  return canvas.value?.viewer?.openings.isOpen(openingId) ?? false;
}

function setOpeningOpen(open: boolean): void {
  const id = selectedOpeningId.value;
  const viewer = canvas.value?.viewer;
  if (!id || !viewer) return;

  openingOpen.value = open;
  if (!viewer.openings.setOpen(id, open)) return;

  // Полотно строится вместе с проёмом: пересобираем сцену комнаты
  viewer.openings.build(scene.doc.rooms, viewer.materials);
  viewer.invalidate();
}

function updateOpening(patch: Partial<Opening>): void {
  const id = selectedOpeningId.value;
  if (id) scene.updateOpening(id, patch);
}

function removeOpening(): void {
  const id = selectedOpeningId.value;
  if (!id) return;
  selectedOpeningId.value = null;
  scene.removeOpening(id);
}

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
  if (mode.value === 'draw-wall') {
    return drawing.points.value.length === 0
      ? 'Тапните по полу, чтобы поставить первую точку'
      : 'Тап достраивает стену, тап по первой точке замыкает контур, двойной тап завершает';
  }
  if (mode.value === 'add-door') return 'Тапните по стене, куда поставить дверь';
  if (mode.value === 'add-window') return 'Тапните по стене, куда поставить окно';
  if (mode.value === 'add-service') {
    return `Тапните по стене: ${serviceInfo(serviceKind.value).name.toLowerCase()}. Тап по метке удаляет её`;
  }
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
          @dimension-tap="onDimensionTap"
          @aim="onAim"
          @opening-tap="onOpeningTap"
          @service-tap="scene.removeService"
        />
        <DimensionEditor
          v-if="editedDimension"
          :key="editedDimension.id"
          :value-mm="editedDimension.valueMm"
          :x="editedDimension.x"
          :y="editedDimension.y"
          @apply="applyDimension"
          @cancel="editedDimension = null"
        />
        <OpeningInspector
          v-if="selectedOpening"
          :opening="selectedOpening"
          :materials="catalog.materialByCode"
          :open="openingOpen"
          @update="updateOpening"
          @remove="removeOpening"
          @set-open="setOpeningOpen"
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
