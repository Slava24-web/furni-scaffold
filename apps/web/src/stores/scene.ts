import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import {
  PlacementSchema,
  deterministicUuid,
  emptySceneDoc,
  randomUUID,
  type CatalogProduct,
  type Opening,
  type Placement,
  type Room,
  type SceneDoc,
  type Wall,
} from '@furni/shared';

/**
 * Стор сцены. Хранит ТОЛЬКО сериализуемый документ.
 * Ни одного объекта Three.js здесь быть не может (CLAUDE.md, правило 1).
 * Позиции во время перетаскивания сюда не пишутся (правило 3).
 *
 * Документ — источник правды: сцена во вьюере это его проекция, которую
 * пересобирает useSceneSync. Обратное направление есть только в момент
 * фиксации жеста.
 */
export const useSceneStore = defineStore('scene', () => {
  const doc = shallowRef<SceneDoc>(emptySceneDoc());
  const sceneId = ref<string | null>(null);
  const dirty = ref(false);
  const saving = ref(false);

  const undoStack = shallowRef<SceneDoc[]>([]);
  const redoStack = shallowRef<SceneDoc[]>([]);
  const MAX_HISTORY = 50; // ТЗ FR-PLN-11

  function pushHistory(): void {
    undoStack.value = [...undoStack.value.slice(-(MAX_HISTORY - 1)), doc.value];
    redoStack.value = [];
  }

  /** Единственная точка записи документа: история и флаг правки не забываются. */
  function commit(next: SceneDoc): void {
    pushHistory();
    doc.value = next;
    dirty.value = true;
  }

  function updatePlacement(instanceId: string, patch: Partial<Placement>): void {
    commit({
      ...doc.value,
      placements: doc.value.placements.map((p) =>
        p.instanceId === instanceId ? { ...p, ...patch } : p,
      ),
    });
  }

  /**
   * Размещение изделия из каталога.
   *
   * Высота берётся из товара, а не из точки броска: верхний шкаф обязан
   * висеть на своей отметке, даже если его бросили на пол.
   */
  function addPlacement(product: CatalogProduct, positionMm: { x: number; z: number }): Placement {
    const placement = PlacementSchema.parse({
      instanceId: randomUUID(),
      productId: deterministicUuid(product.sku),
      sku: product.sku,
      position: {
        x: Math.round(positionMm.x),
        y: product.mountHeightMm,
        z: Math.round(positionMm.z),
      },
      rotationY: 0,
    });

    commit({ ...doc.value, placements: [...doc.value.placements, placement] });
    return placement;
  }

  function removePlacement(instanceId: string): void {
    commit({
      ...doc.value,
      placements: doc.value.placements.filter((p) => p.instanceId !== instanceId),
    });
  }

  /** Замена планировки. Комната в документе одна: несколько помещений — фаза 4. */
  function setRoom(room: Room): void {
    commit({ ...doc.value, rooms: [room] });
  }

  function addWall(wall: Wall): void {
    const [room] = doc.value.rooms;
    if (!room) {
      commit({
        ...doc.value,
        rooms: [
          {
            id: randomUUID(),
            name: 'Комната',
            walls: [wall],
            openings: [],
            floorMaterialId: null,
            ceilingMaterialId: null,
          },
        ],
      });
      return;
    }
    commit({
      ...doc.value,
      rooms: [{ ...room, walls: [...room.walls, wall] }],
    });
  }

  function addOpening(opening: Opening): void {
    const [room] = doc.value.rooms;
    if (!room) return;
    commit({
      ...doc.value,
      rooms: [{ ...room, openings: [...room.openings, opening] }],
    });
  }

  function clearRooms(): void {
    commit({ ...doc.value, rooms: [] });
  }

  function undo(): void {
    const prev = undoStack.value.at(-1);
    if (!prev) return;
    redoStack.value = [...redoStack.value, doc.value];
    undoStack.value = undoStack.value.slice(0, -1);
    doc.value = prev;
    dirty.value = true;
  }

  function redo(): void {
    const next = redoStack.value.at(-1);
    if (!next) return;
    undoStack.value = [...undoStack.value, doc.value];
    redoStack.value = redoStack.value.slice(0, -1);
    doc.value = next;
    dirty.value = true;
  }

  return {
    doc,
    sceneId,
    dirty,
    saving,
    undoStack,
    redoStack,
    updatePlacement,
    addPlacement,
    removePlacement,
    setRoom,
    addWall,
    addOpening,
    clearRooms,
    undo,
    redo,
    pushHistory,
  };
});
