import { computed, ref, watch, type Ref } from 'vue';
import {
  planDimensions,
  rectangularExtent,
  resizeOpening,
  resizeRoomWall,
  type Opening,
} from '@furni/shared';
import { useSceneStore } from '../stores/scene';
import type { Viewer } from '@furni/viewer';
import type { DimensionHit, FloorPoint } from './useSceneEditing';

/**
 * Правка проёмов и размеров по размерным линиям.
 *
 * Вынесено из страницы планировщика: у неё и без того четыре разные
 * обязанности, а это — своя, замкнутая. Композабл держит только
 * состояние выбора и правки, а рисование остаётся за вьюером.
 */

export interface OpeningEditingDeps {
  /** Прямоугольник области сцены: жест приходит в координатах окна */
  sceneRect: () => DOMRect | null;
  viewer: () => Viewer | null | undefined;
  /** Кадрирование помещения после правки его размера */
  focusArea: (centreMm: FloorPoint, radiusMm: number) => void;
}

export interface EditedDimension {
  id: string;
  valueMm: number;
  x: number;
  y: number;
}

export function useOpeningEditing(deps: OpeningEditingDeps) {
  const scene = useSceneStore();

  const selectedOpeningId = ref<string | null>(null);
  const editedDimension = ref<EditedDimension | null>(null);
  /**
   * Распахнутая дверь — состояние вьюера, а не документа: это осмотр,
   * а не свойство планировки. Поэтому панель и спрашивает вьюер.
   */
  const openingOpen = ref(false);

  const selectedOpening = computed<Opening | undefined>(() => {
    const id = selectedOpeningId.value;
    return id ? scene.doc.rooms[0]?.openings.find((opening) => opening.id === id) : undefined;
  });

  /**
   * Подсветка выбранного проёма.
   *
   * Тот же прямоугольник, что показывает будущее место: выделение должно
   * читаться одинаково и до вставки, и после неё.
   */
  watch([selectedOpening, () => deps.viewer()], ([opening, viewer]) => {
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

  function selectOpening(openingId: string | null): void {
    selectedOpeningId.value = openingId;
    openingOpen.value = openingId
      ? (deps.viewer()?.openings.isOpen(openingId) ?? false)
      : false;
  }

  function setOpeningOpen(open: boolean): void {
    const id = selectedOpeningId.value;
    const viewer = deps.viewer();
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

  /**
   * Тап по размерной линии.
   *
   * Координаты переводятся в систему области сцены: поле ввода лежит
   * в ней, а жест приходит в клиентских координатах окна.
   */
  function onDimensionTap(hit: DimensionHit | null): void {
    const rect = deps.sceneRect();
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
    deps.focusArea(
      { x: (extent.minX + extent.maxX) / 2, z: (extent.minZ + extent.maxZ) / 2 },
      Math.max(extent.maxX - extent.minX, extent.maxZ - extent.minZ) * 0.75,
    );
  }

  return {
    selectedOpening,
    selectedOpeningId: selectedOpeningId as Ref<string | null>,
    openingOpen,
    editedDimension,
    selectOpening,
    setOpeningOpen,
    updateOpening,
    removeOpening,
    onDimensionTap,
    applyDimension,
  };
}
