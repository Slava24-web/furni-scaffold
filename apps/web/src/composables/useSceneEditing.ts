import { computed, markRaw, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import { Vector2, Vector3 } from 'three';
import {
  CameraController,
  DEFAULT_SNAP,
  GestureController,
  SnapEngine,
  type GestureEvent,
  type SnapTarget,
  type Viewer,
} from '@furni/viewer';
import {
  EMPTY_CONFLICTS,
  findConflicts,
  hasConflicts,
  innerNormal,
  placementBox,
  type Box,
  type ConflictReport,
  type Placement,
  type Wall,
} from '@furni/shared';
import { useCatalogStore } from '../stores/catalog';
import { useSceneStore } from '../stores/scene';

/**
 * Связка жестов, камеры, выделения и снаппинга.
 *
 * ПРАВИЛО 3 из CLAUDE.md: во время перетаскивания позиция в Pinia НЕ пишется.
 * Объект двигается напрямую в Three.js, стор обновляется один раз на dragEnd.
 */
/** Режим работы планировщика: что делает тап по сцене. */
export type PlannerMode = 'select' | 'draw-wall' | 'add-door' | 'add-window';

export interface FloorPoint {
  x: number;
  z: number;
}

export function useSceneEditing(viewer: ShallowRef<Viewer | null>, options: {
  onCommit: (instanceId: string, placement: Partial<Placement>) => void;
  /** Текущий режим. По умолчанию выделение объектов. */
  mode?: Ref<PlannerMode>;
  /** Тап по полу в режиме, отличном от выделения. Координаты в мм. */
  onFloorTap?: (point: FloorPoint) => void;
  /** Двойной тап в режиме планировки: завершение контура. */
  onFloorDoubleTap?: () => void;
}) {
  const scene = useSceneStore();
  const catalog = useCatalogStore();

  const selectedId = ref<string | null>(null);
  const isSnapping = ref(false);
  const conflicts = shallowRef<ConflictReport>(EMPTY_CONFLICTS);
  const hasConflict = computed(() => hasConflicts(conflicts.value));
  const snapEngine = shallowRef(markRaw(new SnapEngine()));

  let gestures: GestureController | null = null;
  let camera: CameraController | null = null;
  let element: HTMLElement | null = null;
  /** Прямоугольник канваса кэшируется: getBoundingClientRect на каждое
   *  движение указателя — это принудительный reflow в горячем пути. */
  let rect: DOMRect | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const ndc = new Vector2();
  const desiredMm = new Vector2();

  function attach(target: HTMLElement): void {
    element = target;
    const v = viewer.value;
    if (!v) return;

    camera = markRaw(new CameraController(v.camera));
    refreshRect();

    resizeObserver = new ResizeObserver(refreshRect);
    resizeObserver.observe(target);

    gestures = markRaw(
      new GestureController(target, {
        onGesture: handleGesture,
        isOnSelection: (point) => hitTestSelection(point),
        haptic: (pattern) => navigator.vibrate?.(pattern),
      }),
    );

    // Колесо мыши: на десктопе это основной способ зума
    target.addEventListener('wheel', onWheel, { passive: false });
  }

  function refreshRect(): void {
    if (!element) return;
    rect = element.getBoundingClientRect();
    camera?.setViewport(rect.width, rect.height);
    viewer.value?.invalidate();
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    camera?.dolly(event.deltaY);
    viewer.value?.invalidate();
  }

  /** Клиентские координаты указателя -> NDC канваса. */
  function toNdc(point: Vector2): Vector2 {
    if (!rect || !camera) return ndc.set(0, 0);
    return camera.toNdc(point.x - rect.left, point.y - rect.top, ndc);
  }

  function hitTestSelection(point: Vector2): boolean {
    const v = viewer.value;
    if (!selectedId.value || !v) return false;
    return v.pick(toNdc(point))?.instanceId === selectedId.value;
  }

  function select(instanceId: string | null): void {
    const v = viewer.value;
    selectedId.value = instanceId;
    if (!v) return;

    const instance = instanceId ? v.registry.get(instanceId) : undefined;
    if (instance) v.selection.show(instance.root);
    else v.selection.hide();
    v.invalidate();
  }

  /** Размещение выделенного объекта из документа сцены. */
  function selectedPlacement(): Placement | undefined {
    return scene.doc.placements.find((p) => p.instanceId === selectedId.value);
  }

  /** Все стены документа одним списком. */
  function allWalls(): Wall[] {
    return scene.doc.rooms.flatMap((room) => room.walls);
  }

  /** Габариты остальных объектов сцены. Товары без каталога пропускаются. */
  function otherBoxes(exceptId: string | null): { id: string; box: Box }[] {
    const boxes: { id: string; box: Box }[] = [];
    for (const placement of scene.doc.placements) {
      if (placement.instanceId === exceptId) continue;
      const product = catalog.bySku.get(placement.sku);
      if (!product) continue;
      boxes.push({ id: placement.instanceId, box: placementBox(placement, product) });
    }
    return boxes;
  }

  /**
   * Кэш соседей на время жеста.
   *
   * Ни цели привязки, ни габариты соседей во время перетаскивания
   * не меняются, а пересчёт на каждое движение указателя означал бы
   * обход всей сцены в горячем пути.
   */
  let staticBoxes: { id: string; box: Box }[] = [];
  let dragWalls: Wall[] = [];

  /**
   * Цели привязки: стены помещения и габариты остальных объектов.
   * Габарит превращает соседа в цель СТЫКОВКИ: модуль встаёт грань
   * в грань, а не центром в центр.
   */
  function beginDrag(exceptId: string | null = selectedId.value): void {
    const targets: SnapTarget[] = [];

    for (const room of scene.doc.rooms) {
      for (const wall of room.walls) {
        const normal = innerNormal(room, wall);
        targets.push({
          kind: 'wall',
          a: new Vector2(wall.start.x, wall.start.y),
          b: new Vector2(wall.end.x, wall.end.y),
          normal: new Vector2(normal.x, normal.y),
          halfThicknessMm: wall.thickness / 2,
          sourceId: wall.id,
        });
      }
    }

    for (const placement of scene.doc.placements) {
      if (placement.instanceId === exceptId) continue;
      const product = catalog.bySku.get(placement.sku);
      targets.push({
        kind: 'object',
        position: new Vector2(placement.position.x, placement.position.z),
        rotation: placement.rotationY,
        sourceId: placement.instanceId,
        ...(product
          ? { footprint: { halfWidthMm: product.widthMm / 2, halfDepthMm: product.depthMm / 2 } }
          : {}),
      });
    }

    snapEngine.value.setTargets(targets);
    staticBoxes = otherBoxes(exceptId);
    dragWalls = allWalls();
  }

  /**
   * Пересчёт конфликтов выделенного объекта.
   *
   * Во время жеста габарит берётся из живого Three.js: в документ
   * позиция ещё не записана (CLAUDE.md, правило 3). Вне жеста —
   * из документа, так работает и отмена, и загрузка сцены.
   */
  function updateConflicts(subject?: Box): void {
    const v = viewer.value;
    const id = selectedId.value;

    if (!id) {
      conflicts.value = EMPTY_CONFLICTS;
      v?.selection.setConflict(false);
      return;
    }

    const box = subject ?? documentBox(id);
    if (!box) {
      conflicts.value = EMPTY_CONFLICTS;
      v?.selection.setConflict(false);
      return;
    }

    const neighbours = subject ? staticBoxes : otherBoxes(id);
    const walls = subject ? dragWalls : allWalls();

    conflicts.value = findConflicts(box, neighbours, walls);
    v?.selection.setConflict(hasConflicts(conflicts.value));
    v?.invalidate();
  }

  function documentBox(instanceId: string): Box | null {
    const placement = scene.doc.placements.find((p) => p.instanceId === instanceId);
    const product = placement && catalog.bySku.get(placement.sku);
    return placement && product ? placementBox(placement, product) : null;
  }

  /** Габарит объекта по его текущему положению в сцене. */
  function liveBox(instanceId: string): Box | null {
    const v = viewer.value;
    const instance = v?.registry.get(instanceId);
    const placement = scene.doc.placements.find((p) => p.instanceId === instanceId);
    const product = placement && catalog.bySku.get(placement.sku);
    if (!instance || !product) return null;

    const bottomMm = instance.root.position.y * 1000;
    return {
      centre: { x: instance.root.position.x * 1000, y: instance.root.position.z * 1000 },
      halfWidthMm: product.widthMm / 2,
      halfDepthMm: product.depthMm / 2,
      rotationDeg: (instance.root.rotation.y * 180) / Math.PI,
      bottomMm,
      topMm: bottomMm + product.heightMm,
    };
  }

  function handleGesture(e: GestureEvent): void {
    const v = viewer.value;
    if (!v || !camera) return;

    switch (e.type) {
      case 'doubleTap':
        // Двойным тапом заканчивают ломаную во всех планировщиках.
        // Он же приходит вместо второго 'tap', если тапнули быстро,
        // поэтому в режиме планировки его нельзя игнорировать
        if ((options.mode?.value ?? 'select') !== 'select') options.onFloorDoubleTap?.();
        break;

      case 'tap': {
        // В режимах планировки тап адресован полу, а не объектам:
        // иначе рисование стены выделяло бы мебель под курсором
        if ((options.mode?.value ?? 'select') !== 'select') {
          const point = floorPointAt(e.point);
          if (point) options.onFloorTap?.(point);
          break;
        }
        select(v.pick(toNdc(e.point))?.instanceId ?? null);
        break;
      }

      case 'dragStart':
        if (e.onSelection) beginDrag();
        break;

      case 'dragMove':
        if (e.onSelection && selectedId.value) {
          moveSelected(e.point);
        } else {
          camera.orbit(e.delta.x, e.delta.y);
        }
        v.invalidate();
        break;

      case 'dragEnd':
        if (e.onSelection && selectedId.value) {
          commitSelectedPosition();
        }
        isSnapping.value = false;
        break;

      case 'pinch':
        camera.zoom(e.scale);
        v.invalidate();
        break;

      case 'twoFingerPan':
        camera.pan(e.delta.x, e.delta.y);
        v.invalidate();
        break;
    }
  }

  function moveSelected(screenPoint: Vector2): void {
    const v = viewer.value;
    if (!v || !camera || !selectedId.value) return;
    const instance = v.registry.get(selectedId.value);
    if (!instance || instance.locked) return;

    const floor = camera.projectToFloor(toNdc(screenPoint));
    if (!floor) return; // луч ушёл выше горизонта — движения нет

    desiredMm.set(floor.x * 1000, floor.z * 1000);

    const product = catalog.bySku.get(selectedPlacement()?.sku ?? '');
    const result = snapEngine.value.snap(desiredMm, {
      ...DEFAULT_SNAP,
      mmPerPixel: camera.mmPerPixel,
      // Габариты нужны, чтобы объект встал вплотную к стене и грань
      // в грань к соседу, а не центром на грань. Мелкая фурнитура
      // к стенам не липнет.
      objectHalfDepthMm: (product?.depthMm ?? 0) / 2,
      objectHalfWidthMm: (product?.widthMm ?? 0) / 2,
      enableWalls: product?.snapToWall ?? true,
    });

    if (result.snapped && !isSnapping.value) {
      navigator.vibrate?.(8); // тактильный отклик на привязку (ТЗ 8.2)
    }
    isSnapping.value = result.snapped;

    // Прямая мутация Three.js. В Pinia НЕ пишем — это горячий путь.
    // Высота сохраняется: верхний шкаф не должен падать на пол при сдвиге.
    instance.root.position.set(
      result.position.x / 1000,
      instance.root.position.y,
      result.position.y / 1000,
    );
    if (result.rotation !== null) {
      instance.root.rotation.y = (result.rotation * Math.PI) / 180;
    }
    v.selection.refresh(instance.root);
    updateConflicts(liveBox(selectedId.value) ?? undefined);
  }

  function commitSelectedPosition(): void {
    const v = viewer.value;
    if (!v || !selectedId.value) return;
    const instance = v.registry.get(selectedId.value);
    if (!instance) return;

    // Единственная запись в стор за весь жест
    options.onCommit(selectedId.value, {
      position: {
        x: Math.round(instance.root.position.x * 1000),
        y: Math.round(instance.root.position.y * 1000),
        z: Math.round(instance.root.position.z * 1000),
      },
      rotationY: Math.round((instance.root.rotation.y * 180) / Math.PI),
    });
  }

  /** Точка пола под координатой окна, в мм. null — луч ушёл выше горизонта. */
  function floorPointAt(clientPoint: Vector2): FloorPoint | null {
    if (!camera) return null;
    const floor = camera.projectToFloor(toNdc(clientPoint));
    return floor ? { x: floor.x * 1000, z: floor.z * 1000 } : null;
  }

  /**
   * Точка постановки для объекта, брошенного из каталога.
   *
   * Бросок проходит через ту же привязку, что и перетаскивание: иначе
   * модуль встаёт у стены боком, и пользователю приходится доворачивать
   * каждый шкаф вручную.
   */
  function snapDropPoint(
    product: { widthMm: number; depthMm: number; snapToWall: boolean },
    clientX: number,
    clientY: number,
  ): { x: number; z: number; rotationY: number } | null {
    const point = floorPointAt(new Vector2(clientX, clientY));
    if (!point || !camera) return null;

    // Исключать нечего: бросаемого объекта в документе ещё нет, а ранее
    // выделенный сосед — как раз тот, к которому надо пристыковаться
    beginDrag(null);
    const result = snapEngine.value.snap(new Vector2(point.x, point.z), {
      ...DEFAULT_SNAP,
      mmPerPixel: camera.mmPerPixel,
      objectHalfDepthMm: product.depthMm / 2,
      objectHalfWidthMm: product.widthMm / 2,
      enableWalls: product.snapToWall,
    });

    return { x: result.position.x, z: result.position.y, rotationY: result.rotation ?? 0 };
  }

  /** Показать помещение целиком: вызывается после создания планировки. */
  function focusArea(centreMm: FloorPoint, radiusMm: number): void {
    if (!camera) return;
    camera.focus(
      new Vector3(centreMm.x / 1000, 0.4, centreMm.z / 1000),
      Math.max(1, radiusMm / 1000),
    );
    viewer.value?.invalidate();
  }

  /** Для сброса объекта из каталога: координаты окна -> точка пола. */
  function screenToFloorMm(clientX: number, clientY: number): FloorPoint | null {
    return floorPointAt(new Vector2(clientX, clientY));
  }

  function detach(): void {
    element?.removeEventListener('wheel', onWheel);
    resizeObserver?.disconnect();
    resizeObserver = null;
    gestures?.dispose();
    gestures = null;
    camera = null;
    element = null;
    rect = null;
  }

  // Вне жеста конфликты пересчитываются по документу: так они верны
  // после отмены, загрузки сцены и удаления соседа
  watch([selectedId, () => scene.doc], () => updateConflicts(), { immediate: true });

  return {
    selectedId,
    isSnapping,
    conflicts,
    hasConflict,
    attach,
    detach,
    select,
    screenToFloorMm,
    snapDropPoint,
    focusArea,
  };
}
