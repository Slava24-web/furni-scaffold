import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import {
  PlacementSchema,
  deterministicUuid,
  emptySceneDoc,
  placementProductSize,
  randomUUID,
  settlePlacements,
  type CatalogProduct,
  type Opening,
  type Placement,
  type Room,
  type SceneDoc,
  type ServicePoint,
  type Wall,
} from '@furni/shared';
import { useCatalogStore } from './catalog';

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
  const catalog = useCatalogStore();
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
    doc.value = settle(next);
    dirty.value = true;
  }

  /**
   * Осадка: высоты приводятся к тому, что реально стоит под объектами.
   *
   * Делается на КАЖДУЮ запись документа, а не только на удаление: опору
   * можно не только убрать, но и отодвинуть. Убрали столешницу — вещи на
   * ней опускаются, вернули отменой — поднимаются обратно. Иначе документ
   * рассогласуется со сценой при первом же удалении опоры.
   */
  function settle(candidate: SceneDoc): SceneDoc {
    const items = candidate.placements.flatMap((placement) => {
      const product = catalog.bySku.get(placement.sku);
      if (!product) return [];
      return [
        {
          instanceId: placement.instanceId,
          placement,
          // Размер заказанный, а не каталожный: растянутый шкаф и опора
          // выше, и осадка считается по нему
          size: placementProductSize(placement, product),
          mountHeightMm: product.mountHeightMm,
          stackable: product.stackable,
        },
      ];
    });

    const changes = settlePlacements(items);
    if (changes.length === 0) return candidate;

    const heights = new Map(changes.map((change) => [change.instanceId, change.yMm]));
    return {
      ...candidate,
      placements: candidate.placements.map((placement) => {
        const yMm = heights.get(placement.instanceId);
        return yMm === undefined
          ? placement
          : { ...placement, position: { ...placement.position, y: yMm } };
      }),
    };
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
   * Высота приходит рассчитанной: она зависит и от отметки товара, и от
   * опоры под точкой постановки — вещь, брошенная на столешницу, встаёт
   * на неё, а не проваливается на пол.
   */
  function addPlacement(
    product: CatalogProduct,
    positionMm: { x: number; z: number; y?: number },
    rotationY = 0,
  ): Placement {
    const placement = PlacementSchema.parse({
      instanceId: randomUUID(),
      productId: deterministicUuid(product.sku),
      sku: product.sku,
      position: {
        x: Math.round(positionMm.x),
        y: Math.round(positionMm.y ?? product.mountHeightMm),
        z: Math.round(positionMm.z),
      },
      rotationY: Math.round(rotationY),
    });

    commit({ ...doc.value, placements: [...doc.value.placements, placement] });
    return placement;
  }

  /**
   * Готовая раскладка кухни поверх текущей сцены.
   *
   * Прежние размещения не стираются: сценарий добавляют к тому, что уже
   * стоит, а передумавшему остаётся отмена.
   */
  function addPlacements(items: readonly Placement[]): void {
    if (items.length === 0) return;
    commit({ ...doc.value, placements: [...doc.value.placements, ...items] });
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

  /** Правка проёма: размеры, изделие, сторона навески. */
  function updateOpening(openingId: string, patch: Partial<Opening>): void {
    const [room] = doc.value.rooms;
    if (!room) return;
    commit({
      ...doc.value,
      rooms: [
        {
          ...room,
          openings: room.openings.map((opening) =>
            opening.id === openingId ? { ...opening, ...patch } : opening,
          ),
        },
      ],
    });
  }

  function removeOpening(openingId: string): void {
    const [room] = doc.value.rooms;
    if (!room) return;
    commit({
      ...doc.value,
      rooms: [{ ...room, openings: room.openings.filter((o) => o.id !== openingId) }],
    });
  }

  /** Напольное покрытие помещения. null — служебный серый пол. */
  function setFloor(code: string | null): void {
    const [room] = doc.value.rooms;
    if (!room || room.floorMaterialId === code) return;
    commit({ ...doc.value, rooms: [{ ...room, floorMaterialId: code }] });
  }

  /** Инженерная точка: розетка, вода, слив, вентканал, газ. */
  function addService(service: ServicePoint): void {
    commit({ ...doc.value, services: [...doc.value.services, service] });
  }

  function removeService(serviceId: string): void {
    commit({
      ...doc.value,
      services: doc.value.services.filter((service) => service.id !== serviceId),
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
    addPlacements,
    removePlacement,
    setRoom,
    addWall,
    addOpening,
    updateOpening,
    removeOpening,
    setFloor,
    addService,
    removeService,
    clearRooms,
    undo,
    redo,
    pushHistory,
  };
});
