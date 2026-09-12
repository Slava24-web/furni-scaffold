<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  createRectangularRoom,
  estimateScene,
  placementPriceCents,
  projectOntoWall,
  randomUUID,
  rectangularExtent,
  resizeRoomWall,
  wallLengthMm,
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
import DimensionEditor from '../components/DimensionEditor.vue';
import { conflictMessage } from '../lib/conflictMessage';
import { useCatalogDrag } from '../composables/useCatalogDrag';
import { useWallDrawing } from '../composables/useWallDrawing';
import { installTestingApi, uninstallTestingApi } from '../dev/testingApi';
import { useCatalogStore } from '../stores/catalog';
import { useSceneStore } from '../stores/scene';
import type { DimensionHit, FloorPoint, PlannerMode } from '../composables/useSceneEditing';

const route = useRoute();
const scene = useSceneStore();
const catalog = useCatalogStore();
const canvas = ref<InstanceType<typeof SceneCanvas> | null>(null);
const mode = ref<PlannerMode>('select');

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

function setMode(next: PlannerMode): void {
  mode.value = next;
  if (next === 'draw-wall') drawing.start();
  else drawing.finish();
}

function finishDrawing(): void {
  drawing.finish();
  mode.value = 'select';
}

function onFloorTap(point: FloorPoint): void {
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

  let best: { wall: Wall; offsetMm: number; distanceMm: number } | null = null;
  for (const wall of room.walls) {
    const projection = projectOntoWall(wall, { x: point.x, y: point.z });
    if (!best || projection.distanceMm < best.distanceMm) {
      best = { wall, offsetMm: projection.offsetMm, distanceMm: projection.distanceMm };
    }
  }
  if (!best) return;

  const width = kind === 'door' ? 900 : 1400;
  const maxOffset = Math.max(0, wallLengthMm(best.wall) - width);
  const opening: Opening = {
    id: randomUUID(),
    wallId: best.wall.id,
    kind,
    offset: Math.round(Math.min(maxOffset, Math.max(0, best.offsetMm - width / 2))),
    width,
    height: kind === 'door' ? 2100 : 1400,
    sillHeight: kind === 'door' ? 0 : 800,
    swingRadius: null,
  };

  scene.addOpening(opening);
  mode.value = 'select';
}

/**
 * Правка размера помещения по размерной линии.
 *
 * Координаты тапа переводятся в систему области сцены: поле ввода лежит
 * в ней, а жест приходит в клиентских координатах окна.
 */
const editedDimension = ref<{ wallId: string; valueMm: number; x: number; y: number } | null>(null);

function onDimensionTap(hit: DimensionHit | null): void {
  const rect = sceneRect();
  if (!hit || !rect) {
    editedDimension.value = null;
    return;
  }
  editedDimension.value = {
    wallId: hit.wallId,
    valueMm: hit.clearLengthMm,
    x: hit.clientX - rect.left,
    y: hit.clientY - rect.top,
  };
}

function applyDimension(clearLengthMm: number): void {
  const edited = editedDimension.value;
  const [room] = scene.doc.rooms;
  editedDimension.value = null;
  if (!edited || !room) return;

  const next = resizeRoomWall(room, edited.wallId, clearLengthMm);
  // Отвергнутый размер не должен попадать в историю отмен пустым шагом
  if (next === room) return;

  scene.setRoom(next);
  // Кадрирование по новым габаритам: выросшая стена уезжает за край
  // экрана, и пользователь не видит результата своего же ввода
  const extent = rectangularExtent(next);
  if (!extent) return;
  canvas.value?.focusArea(
    { x: (extent.minX + extent.maxX) / 2, z: (extent.minZ + extent.maxZ) / 2 },
    Math.max(extent.maxX - extent.minX, extent.maxZ - extent.minZ) * 0.75,
  );
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
      :drawing-active="drawing.active.value"
      :can-undo="scene.undoStack.length > 0"
      :can-redo="scene.redoStack.length > 0"
      @create-room="createRoom"
      @set-mode="setMode"
      @finish-drawing="finishDrawing"
      @clear-rooms="scene.clearRooms()"
      @undo="scene.undo()"
      @redo="scene.redo()"
    />

    <div class="planner__body">
      <div class="planner__sidebar">
        <CatalogPanel :dragging="drag.product.value" @drag-start="drag.start" />
        <EstimatePanel :estimate="estimate" />
      </div>

      <div class="planner__scene" :class="{ 'is-drop-target': drag.overScene.value }">
        <SceneCanvas
          ref="canvas"
          :force-tier="forceTier"
          :mode="mode"
          @floor-tap="onFloorTap"
          @floor-double-tap="finishDrawing"
          @dimension-tap="onDimensionTap"
        />
        <DimensionEditor
          v-if="editedDimension"
          :key="editedDimension.wallId"
          :value-mm="editedDimension.valueMm"
          :x="editedDimension.x"
          :y="editedDimension.y"
          @apply="applyDimension"
          @cancel="editedDimension = null"
        />
        <ObjectInspector
          v-if="selected"
          :placement="selected"
          :product="catalog.bySku.get(selected.sku)"
          :materials="catalog.materialByCode"
          :price-cents="selectedPrice"
          :conflicts="canvas?.conflicts"
          @update="updateSelected"
          @remove="deleteSelected"
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
