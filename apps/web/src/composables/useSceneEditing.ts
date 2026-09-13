import { markRaw, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import { Vector2, Vector3 } from 'three';
import {
  CameraController,
  DEFAULT_SNAP,
  GestureController,
  SnapEngine,
  type GestureEvent,
  type Viewer,
} from '@furni/viewer';
import {
  placementProductSize,
  roomBounds,
  normalizeAngleDeg,
  planAngleDeg,
  restingHeightMm,
  type Box,
  type CatalogProduct,
  type Placement,
  type RoomBoundsMm,
} from '@furni/shared';
import { useCatalogStore } from '../stores/catalog';
import { useSceneStore } from '../stores/scene';
import {
  allSwings as swingsOf,
  allWalls as wallsOf,
  boxOf,
  confine,
  drawerZoneOf,
  neighbourBoxes,
  neighbourDrawerZones as drawerZonesOf,
} from '../lib/sceneBoxes';
import { snapTargets } from '../lib/snapTargets';
import { ScreenProjector, type FloorPoint } from '../lib/ScreenProjector';
import { routeTap, type TapAction } from '../lib/tapRouting';
import { useSceneConflicts, type ConflictEnvironment } from './useSceneConflicts';
import { useDropPreview, type DropPoint } from './useDropPreview';

export type { FloorPoint } from '../lib/ScreenProjector';

/**
 * Связка жестов, камеры, выделения и снаппинга.
 *
 * ПРАВИЛО 3 из CLAUDE.md: во время перетаскивания позиция в Pinia НЕ пишется.
 * Объект двигается напрямую в Three.js, стор обновляется один раз на dragEnd.
 *
 * Всё, что можно вынести, вынесено: габариты сцены — в lib/sceneBoxes,
 * цели привязки — в lib/snapTargets, проекция указателя — в
 * lib/ScreenProjector, разбор тапа — в lib/tapRouting, конфликты и
 * призрак переноса — в соседние composables. Здесь остался сам жест.
 */

/** Режим работы планировщика: что делает тап по сцене. */
export type PlannerMode =
  | 'select'
  | 'draw-wall'
  | 'add-door'
  | 'add-window'
  /** Разметка инженерии: тап ставит точку выбранного вида */
  | 'add-service';

/** Тап по размерной линии: ключ подписи, её значение и место для поля ввода. */
export interface DimensionHit {
  id: string;
  lengthMm: number;
  clientX: number;
  clientY: number;
}

export function useSceneEditing(viewer: ShallowRef<Viewer | null>, options: {
  onCommit: (instanceId: string, placement: Partial<Placement>) => void;
  /** Текущий режим. По умолчанию выделение объектов. */
  mode?: Ref<PlannerMode>;
  /** Тап по полу в режиме, отличном от выделения. Координаты в мм. */
  onFloorTap?: (point: FloorPoint) => void;
  /** Двойной тап в режиме планировки: завершение контура. */
  onFloorDoubleTap?: () => void;
  /** Тап по размерной линии; null — тап мимо неё, поле ввода пора закрыть. */
  onDimensionTap?: (hit: DimensionHit | null) => void;
  /** Наведение на пол в режиме вставки проёма; null — указатель ушёл со сцены. */
  onAim?: (point: FloorPoint | null) => void;
  /** Тап по двери или окну; null — тап мимо них. */
  onOpeningTap?: (openingId: string | null) => void;
  /** Тап по метке инженерии. */
  onServiceTap?: (serviceId: string) => void;
}) {
  const scene = useSceneStore();
  const catalog = useCatalogStore();

  const selectedId = ref<string | null>(null);
  const isSnapping = ref(false);
  const snapEngine = shallowRef(markRaw(new SnapEngine()));
  const projector = new ScreenProjector();
  const conflictState = useSceneConflicts(viewer);

  let gestures: GestureController | null = null;
  let element: HTMLElement | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const desiredMm = new Vector2();

  const planning = (): boolean => (options.mode?.value ?? 'select') !== 'select';

  // -------------------------------------------------------------------
  // Окружение сцены
  // -------------------------------------------------------------------

  /** Всё, относительно чего проверяется объект, одним снимком. */
  function documentEnvironment(exceptId: string | null): ConflictEnvironment {
    return {
      neighbours: neighbourBoxes(scene.doc.placements, catalog.bySku, exceptId).map((entry) => ({
        id: entry.instanceId,
        box: entry.box,
      })),
      walls: wallsOf(scene.doc.rooms),
      swings: swingsOf(scene.doc.rooms),
      drawerZones: drawerZonesOf(scene.doc.placements, catalog.bySku, exceptId),
    };
  }

  const zoneOf = (placement: Placement) => drawerZoneOf(placement, catalog.bySku);

  /**
   * Снимок окружения на время жеста.
   *
   * Ни цели привязки, ни габариты соседей во время перетаскивания
   * не меняются, а пересчёт на каждое движение указателя означал бы
   * обход всей сцены в горячем пути. Список препятствий держится
   * готовым: он нужен каждый кадр, и пересобирать его нельзя.
   */
  let dragEnv: ConflictEnvironment | null = null;
  let dragObstacles: Box[] = [];
  let dragBounds: RoomBoundsMm | null = null;
  /** Размещение под жестом: см. placementOf. */
  let dragPlacement: Placement | undefined;

  // -------------------------------------------------------------------
  // Подключение к канвасу
  // -------------------------------------------------------------------

  function attach(target: HTMLElement): void {
    element = target;
    const v = viewer.value;
    if (!v) return;

    projector.attach(target, markRaw(new CameraController(v.camera)));

    resizeObserver = new ResizeObserver(refreshViewport);
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
    // Наведение нужно только режимам вставки проёма: подсветка места
    // обязана следовать за указателем ещё до нажатия
    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerleave', onPointerLeave);
  }

  function refreshViewport(): void {
    projector.refresh();
    viewer.value?.invalidate();
  }

  function detach(): void {
    if (rotationCommitTimer) clearTimeout(rotationCommitTimer);
    rotationCommitTimer = null;
    element?.removeEventListener('wheel', onWheel);
    element?.removeEventListener('pointermove', onPointerMove);
    element?.removeEventListener('pointerleave', onPointerLeave);
    resizeObserver?.disconnect();
    resizeObserver = null;
    gestures?.dispose();
    gestures = null;
    projector.detach();
    element = null;
  }

  function onPointerMove(event: PointerEvent): void {
    if (!planning() || !options.onAim) return;
    options.onAim(projector.floorPointAt(new Vector2(event.clientX, event.clientY)));
  }

  function onPointerLeave(): void {
    options.onAim?.(null);
  }

  function onWheel(event: WheelEvent): void {
    event.preventDefault();
    projector.camera?.dolly(event.deltaY);
    viewer.value?.invalidate();
  }

  /**
   * Попадание в выделение: сам объект или кольцо поворота вокруг него.
   *
   * Кольцо обязано считаться выделением, иначе GestureController отдаст
   * жест камере и поворот превратится в облёт сцены.
   */
  function hitTestSelection(point: Vector2): boolean {
    const v = viewer.value;
    if (!selectedId.value || !v) return false;

    const ndc = projector.toNdc(point);
    if (v.intersects(ndc, v.rotation.mesh)) return true;
    return v.pick(ndc)?.instanceId === selectedId.value;
  }

  // -------------------------------------------------------------------
  // Выделение
  // -------------------------------------------------------------------

  function select(instanceId: string | null): void {
    const v = viewer.value;
    selectedId.value = instanceId;
    if (!v) return;

    const instance = instanceId ? v.registry.get(instanceId) : undefined;
    if (instance) {
      v.selection.show(instance.root);
      v.rotation.attach(instance.root);
    } else {
      v.selection.hide();
      v.rotation.detach();
    }
    v.invalidate();
  }

  /**
   * Размещение по идентификатору.
   *
   * За один кадр перетаскивания оно нужно трижды — самому движению,
   * габариту и проверке конфликтов, — а поиск по документу это линейный
   * обход сцены. На время жеста размещение не меняется (CLAUDE.md,
   * правило 3), поэтому берётся из снимка.
   */
  function placementOf(instanceId: string | null): Placement | undefined {
    if (!instanceId) return undefined;
    if (dragPlacement?.instanceId === instanceId) return dragPlacement;
    return scene.doc.placements.find((p) => p.instanceId === instanceId);
  }

  /** Размещение выделенного объекта из документа сцены. */
  function selectedPlacement(): Placement | undefined {
    return placementOf(selectedId.value);
  }

  /** Открыть или закрыть все дверцы выделенного изделия. */
  function setDoorsOpen(open: boolean): void {
    const v = viewer.value;
    const instance = selectedId.value ? v?.registry.get(selectedId.value) : undefined;
    if (!v || !instance) return;

    v.doors.setAll(instance.root, open);
    v.invalidate();
  }

  // -------------------------------------------------------------------
  // Габариты
  // -------------------------------------------------------------------

  function documentBox(instanceId: string): Box | null {
    const placement = placementOf(instanceId);
    return placement ? boxOf(placement, catalog.bySku) : null;
  }

  /** Габарит объекта по его текущему положению в сцене. */
  function liveBox(instanceId: string): Box | undefined {
    const v = viewer.value;
    const instance = v?.registry.get(instanceId);
    const placement = placementOf(instanceId);
    const product = placement && catalog.bySku.get(placement.sku);
    if (!instance || !product) return undefined;

    const bottomMm = instance.root.position.y * 1000;
    const size = placementProductSize(placement, product);
    return {
      centre: { x: instance.root.position.x * 1000, y: instance.root.position.z * 1000 },
      halfWidthMm: size.widthMm / 2,
      halfDepthMm: size.depthMm / 2,
      rotationDeg: (instance.root.rotation.y * 180) / Math.PI,
      bottomMm,
      topMm: bottomMm + size.heightMm,
      surfaceTopMm: bottomMm + size.surfaceHeightMm,
    };
  }

  /**
   * Пересчёт конфликтов выделенного объекта.
   *
   * Во время жеста габарит берётся из живого Three.js: в документ
   * позиция ещё не записана (CLAUDE.md, правило 3). Вне жеста —
   * из документа, так работает и отмена, и загрузка сцены.
   */
  function updateConflicts(subject?: Box): void {
    const id = selectedId.value;
    const box = id ? (subject ?? documentBox(id)) : null;
    if (!id || !box) {
      conflictState.clear();
      viewer.value?.invalidate();
      return;
    }

    const env = subject && dragEnv ? dragEnv : documentEnvironment(id);
    const placement = placementOf(id);
    // Зона выдвижения считается по тому же габариту, что и проверка:
    // во время перетаскивания это позиция под указателем, а не в документе
    const own = placement
      ? zoneOf({
          ...placement,
          position: subject
            ? { x: box.centre.x, y: box.bottomMm, z: box.centre.y }
            : placement.position,
          rotationY: box.rotationDeg,
        })
      : null;

    conflictState.evaluate(box, env, own);
  }

  // -------------------------------------------------------------------
  // Жесты
  // -------------------------------------------------------------------

  function handleGesture(e: GestureEvent): void {
    const v = viewer.value;
    const camera = projector.camera;
    if (!v || !camera) return;

    switch (e.type) {
      case 'doubleTap':
        // Двойным тапом заканчивают ломаную во всех планировщиках.
        // Он же приходит вместо второго 'tap', если тапнули быстро,
        // поэтому в режиме планировки его нельзя игнорировать
        if (planning()) options.onFloorDoubleTap?.();
        break;

      case 'tap':
        applyTap(
          routeTap(v, projector.toNdc(e.point), {
            planning: planning(),
            selectedId: selectedId.value,
          }),
          e.point,
        );
        break;

      case 'dragStart':
        if (!e.onSelection) break;
        dragKind = v.intersects(projector.toNdc(e.point), v.rotation.mesh) ? 'rotate' : 'move';
        if (dragKind === 'rotate') beginRotate(e.point);
        else beginDrag(selectedId.value, e.point);
        break;

      case 'dragMove':
        if (e.onSelection && selectedId.value) {
          if (dragKind === 'rotate') rotateSelected(e.point);
          else moveSelected(e.point);
        } else {
          camera.orbit(e.delta.x, e.delta.y);
        }
        v.invalidate();
        break;

      case 'dragEnd':
        if (e.onSelection && selectedId.value) commitSelectedPosition();
        dragPlacement = undefined;
        dragKind = 'move';
        isSnapping.value = false;
        break;

      case 'pinch':
        camera.zoom(e.scale);
        v.invalidate();
        break;

      case 'twoFingerRotate':
        // Двупальцевый твист вращает выделенный объект. Знак прямой:
        // жест и поворот вокруг Y при взгляде сверху идут в одну сторону
        // при любом азимуте камеры — разница углов от азимута не зависит
        if (selectedId.value) rotateSelectedBy((e.angle * 180) / Math.PI);
        v.invalidate();
        break;

      case 'twoFingerPan':
        camera.pan(e.delta.x, e.delta.y);
        v.invalidate();
        break;
    }
  }

  /** Исполнение разобранного тапа. Порядок разбора — в lib/tapRouting. */
  function applyTap(action: TapAction, point: Vector2): void {
    const v = viewer.value;
    if (!v) return;

    switch (action.kind) {
      case 'service':
        options.onServiceTap?.(action.serviceId);
        return;
      case 'floor': {
        const floor = projector.floorPointAt(point);
        if (floor) options.onFloorTap?.(floor);
        return;
      }
      case 'dimension':
        options.onDimensionTap?.({ ...action.dimension, clientX: point.x, clientY: point.y });
        return;
    }

    // Тап адресован не размеру — поле ввода размера пора закрыть
    options.onDimensionTap?.(null);

    if (action.kind === 'opening') {
      options.onOpeningTap?.(action.openingId);
      select(null);
      return;
    }
    options.onOpeningTap?.(null);

    switch (action.kind) {
      case 'drawer':
        v.drawers.toggle(action.node);
        v.invalidate();
        return;
      case 'door':
        v.doors.toggle(action.node);
        v.invalidate();
        return;
      case 'select':
        select(action.instanceId);
    }
  }

  // -------------------------------------------------------------------
  // Перетаскивание
  // -------------------------------------------------------------------

  /** Что делает текущий жест: двигает объект или вращает его. */
  let dragKind: 'move' | 'rotate' = 'move';
  const rotateCentreMm = new Vector2();
  let rotatePointerStartDeg = 0;
  let rotateObjectStartDeg = 0;

  /**
   * Смещение между центром объекта и точкой захвата, мм.
   *
   * Без него объект прыгает центром под курсор в момент касания: взяли
   * за угол шкафа — шкаф скакнул на пол-ширины. При взгляде вдоль пола
   * такой прыжок измеряется метрами.
   */
  const grabOffsetMm = new Vector2();

  /** Снимок окружения и целей привязки на один жест. */
  function beginDrag(exceptId: string | null = selectedId.value, grabPoint?: Vector2): void {
    // Прямоугольник канваса обновляется на старте жеста, а не на каждое
    // движение: ResizeObserver ловит не всё — панель каталога может
    // подгрузиться и сдвинуть сцену без изменения её размеров, и тогда
    // луч уходит мимо цели, в которую целится пользователь
    projector.refresh();
    captureGrabOffset(grabPoint);

    dragPlacement = scene.doc.placements.find((p) => p.instanceId === selectedId.value);
    const env = documentEnvironment(exceptId);
    dragEnv = env;
    dragObstacles = env.neighbours.map((entry) => entry.box);
    dragBounds = roomBounds(scene.doc.rooms);
    snapEngine.value.setTargets(snapTargets(scene.doc.rooms, env.neighbours));
  }

  /** Запоминает, за какую точку объекта взялись. */
  function captureGrabOffset(grabPoint?: Vector2): void {
    grabOffsetMm.set(0, 0);

    const instance = selectedId.value ? viewer.value?.registry.get(selectedId.value) : undefined;
    if (!instance || !grabPoint) return;

    // Захват меряется в плоскости, где объект сейчас стоит: для вещи
    // на столешнице пол это не та плоскость
    const hit = projector.floorPointAt(grabPoint, instance.root.position.y * 1000);
    if (!hit) return;

    grabOffsetMm.set(
      instance.root.position.x * 1000 - hit.x,
      instance.root.position.z * 1000 - hit.z,
    );
  }

  /**
   * Высота, на которой окажется объект под указателем.
   *
   * Опора выбирается ЛУЧОМ по тому, во что целится пользователь, а не
   * габаритами в плане: иначе мелочь, брошенная под навесным шкафом,
   * забиралась бы ему на верх, потому что в плане шкаф оказывается
   * «под точкой». Пользователь видит поверхность — на неё и кладём.
   *
   * На опору забирается только помеченное stackable: корпусная мебель
   * стоит на своей отметке.
   */
  function restingHeightUnder(
    clientPoint: Vector2,
    product: Pick<CatalogProduct, 'mountHeightMm' | 'stackable'> | undefined,
    excludeInstanceId?: string,
  ): number {
    const v = viewer.value;
    if (!product) return 0;
    if (!product.stackable || !v) return product.mountHeightMm;

    return restingHeightMm(
      product.mountHeightMm,
      v.supportTopMm(projector.toNdc(clientPoint), excludeInstanceId),
    );
  }

  function moveSelected(screenPoint: Vector2): void {
    const v = viewer.value;
    const camera = projector.camera;
    if (!v || !camera || !selectedId.value) return;
    const instance = v.registry.get(selectedId.value);
    if (!instance || instance.locked) return;

    const dragged = selectedPlacement();
    const catalogProduct = catalog.bySku.get(dragged?.sku ?? '');
    // Размер берётся заказанный: растянутый корпус занимает больше места
    const product =
      dragged && catalogProduct
        ? { ...catalogProduct, ...placementProductSize(dragged, catalogProduct) }
        : catalogProduct;
    // Высота берётся из того, во что целится указатель. Считается ПЕРВОЙ:
    // от неё зависит и плоскость, в которой ищется позиция, и выбор между
    // стыковкой сбоку и выравниванием поверх соседа. Сам перетаскиваемый
    // объект из луча исключён — он следует за курсором и перекрыл бы опору.
    const bottomMm = restingHeightUnder(screenPoint, product, selectedId.value);

    const hit = projector.floorPointAt(screenPoint, bottomMm);
    if (!hit) return; // луч ушёл выше горизонта — движения нет

    // Точка захвата сохраняется: тянут за то место, за которое взялись
    desiredMm.set(hit.x + grabOffsetMm.x, hit.z + grabOffsetMm.y);
    const result = snapEngine.value.snap(desiredMm, {
      ...DEFAULT_SNAP,
      mmPerPixel: camera.mmPerPixel,
      // Габариты нужны, чтобы объект встал вплотную к стене и грань
      // в грань к соседу, а не центром на грань. Мелкая фурнитура
      // к стенам не липнет.
      objectHalfDepthMm: (product?.depthMm ?? 0) / 2,
      objectHalfWidthMm: (product?.widthMm ?? 0) / 2,
      objectBottomMm: bottomMm,
      objectTopMm: bottomMm + (product?.heightMm ?? 0),
      enableWalls: product?.snapToWall ?? true,
    });

    if (result.snapped && !isSnapping.value) {
      navigator.vibrate?.(8); // тактильный отклик на привязку (ТЗ 8.2)
    }
    isSnapping.value = result.snapped;

    const rotationDeg = result.rotation ?? (instance.root.rotation.y * 180) / Math.PI;
    const inside = confine(result.position, {
      halfWidthMm: (product?.widthMm ?? 0) / 2,
      halfDepthMm: (product?.depthMm ?? 0) / 2,
      rotationDeg,
      bottomMm,
      topMm: bottomMm + (product?.heightMm ?? 0),
      obstacles: dragObstacles,
      bounds: dragBounds,
    });

    // Прямая мутация Three.js. В Pinia НЕ пишем — это горячий путь.
    instance.root.position.set(inside.x / 1000, bottomMm / 1000, inside.y / 1000);
    if (result.rotation !== null) {
      instance.root.rotation.y = (result.rotation * Math.PI) / 180;
    }
    v.selection.refresh(instance.root);
    v.rotation.update(instance.root);
    updateConflicts(liveBox(selectedId.value));
  }

  /**
   * Начало поворота. Запоминаются угол указателя и угол объекта: дальше
   * применяется их разница, поэтому объект не прыгает под курсор в момент
   * захвата кольца.
   */
  function beginRotate(point: Vector2): void {
    const v = viewer.value;
    const instance = selectedId.value ? v?.registry.get(selectedId.value) : undefined;
    const floor = projector.floorPointAt(point);
    if (!instance || !floor) return;

    rotateCentreMm.set(instance.root.position.x * 1000, instance.root.position.z * 1000);
    rotatePointerStartDeg = planAngleDeg(floor.x - rotateCentreMm.x, floor.z - rotateCentreMm.y);
    rotateObjectStartDeg = (instance.root.rotation.y * 180) / Math.PI;

    // Соседи на время жеста не меняются: конфликты считаются по снимку
    beginDrag();
  }

  /**
   * Плавный поворот на любой угол.
   *
   * Шага нет намеренно: мебель ставят не только по осям, а кратные углы
   * и так достижимы привязкой к стене и стыковкой с соседом.
   */
  function rotateSelected(point: Vector2): void {
    const v = viewer.value;
    const id = selectedId.value;
    const instance = id ? v?.registry.get(id) : undefined;
    const floor = projector.floorPointAt(point);
    if (!v || !id || !instance || !floor || instance.locked) return;

    const pointerDeg = planAngleDeg(floor.x - rotateCentreMm.x, floor.z - rotateCentreMm.y);
    const delta = normalizeAngleDeg(pointerDeg - rotatePointerStartDeg);

    // Прямая мутация Three.js: в Pinia пишем один раз на dragEnd
    instance.root.rotation.y = ((rotateObjectStartDeg + delta) * Math.PI) / 180;

    v.selection.refresh(instance.root);
    v.rotation.update(instance.root);
    updateConflicts(liveBox(id));
  }

  /** У двупальцевого жеста нет явного конца, поэтому фиксируем по паузе. */
  let rotationCommitTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Поворот выделенного объекта на дельту.
   *
   * В Pinia на каждое событие не пишем (CLAUDE.md, правило 3): запись
   * откладывается до паузы в жесте.
   */
  function rotateSelectedBy(deltaDeg: number): void {
    const v = viewer.value;
    const id = selectedId.value;
    const instance = id ? v?.registry.get(id) : undefined;
    if (!v || !id || !instance || instance.locked) return;

    // Первое событие серии: обновляем снимок соседей для проверки конфликтов
    if (rotationCommitTimer === null) beginDrag(id);

    instance.root.rotation.y += (deltaDeg * Math.PI) / 180;
    v.selection.refresh(instance.root);
    v.rotation.update(instance.root);
    updateConflicts(liveBox(id));

    if (rotationCommitTimer) clearTimeout(rotationCommitTimer);
    rotationCommitTimer = setTimeout(() => {
      rotationCommitTimer = null;
      dragPlacement = undefined;
      commitSelectedPosition();
    }, 220);
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

  // -------------------------------------------------------------------
  // Перенос из каталога
  // -------------------------------------------------------------------

  /**
   * Точка постановки для объекта, брошенного из каталога.
   *
   * Бросок проходит через ту же привязку, что и перетаскивание: иначе
   * модуль встаёт у стены боком, и пользователю приходится доворачивать
   * каждый шкаф вручную.
   */
  function snapDropPoint(
    product: Pick<
      CatalogProduct,
      'widthMm' | 'heightMm' | 'depthMm' | 'mountHeightMm' | 'snapToWall' | 'stackable'
    >,
    clientX: number,
    clientY: number,
  ): DropPoint | null {
    const camera = projector.camera;
    if (!camera) return null;
    const clientPoint = new Vector2(clientX, clientY);

    // Исключать нечего: бросаемого объекта в документе ещё нет, а ранее
    // выделенный сосед — как раз тот, к которому надо пристыковаться
    beginDrag(null);

    // Сначала высота, потом позиция в плоскости этой высоты
    const bottomMm = restingHeightUnder(clientPoint, product);
    const point = projector.floorPointAt(clientPoint, bottomMm);
    if (!point) return null;

    const result = snapEngine.value.snap(new Vector2(point.x, point.z), {
      ...DEFAULT_SNAP,
      mmPerPixel: camera.mmPerPixel,
      objectHalfDepthMm: product.depthMm / 2,
      objectHalfWidthMm: product.widthMm / 2,
      objectBottomMm: bottomMm,
      objectTopMm: bottomMm + product.heightMm,
      enableWalls: product.snapToWall,
    });

    // Бросок ограничивается так же, как перетаскивание: объект, упавший
    // в соседнюю квартиру или внутрь шкафа, пользователю не нужен
    const rotationY = result.rotation ?? 0;
    const inside = confine(result.position, {
      halfWidthMm: product.widthMm / 2,
      halfDepthMm: product.depthMm / 2,
      rotationDeg: rotationY,
      bottomMm,
      topMm: bottomMm + product.heightMm,
      obstacles: dragObstacles,
      bounds: dragBounds,
    });

    return { x: inside.x, z: inside.y, y: bottomMm, rotationY };
  }

  const dropPreview = useDropPreview(viewer, {
    place: (product, clientX, clientY) => snapDropPoint(product, clientX, clientY),
    environment: () => documentEnvironment(null),
    probe: conflictState.probe,
    highlight: conflictState.highlight,
  });

  // -------------------------------------------------------------------
  // Камера
  // -------------------------------------------------------------------

  /** Показать помещение целиком: вызывается после создания планировки. */
  function focusArea(centreMm: FloorPoint, radiusMm: number): void {
    projector.camera?.focus(
      new Vector3(centreMm.x / 1000, 0.4, centreMm.z / 1000),
      Math.max(1, radiusMm / 1000),
    );
    viewer.value?.invalidate();
  }

  /** Для сброса объекта из каталога: координаты окна -> точка пола. */
  function screenToFloorMm(clientX: number, clientY: number): FloorPoint | null {
    return projector.floorPointAt(new Vector2(clientX, clientY));
  }

  // Вне жеста конфликты пересчитываются по документу: так они верны
  // после отмены, загрузки сцены и удаления соседа. Снимок размещения
  // при этом сбрасывается: документ изменился, и держаться за старый
  // объект нельзя
  watch(
    [selectedId, () => scene.doc],
    () => {
      dragPlacement = undefined;
      updateConflicts();
    },
    { immediate: true },
  );

  return {
    selectedId,
    isSnapping,
    conflicts: conflictState.conflicts,
    hasConflict: conflictState.hasConflict,
    preview: dropPreview.preview,
    previewConflicts: dropPreview.previewConflicts,
    updatePreview: dropPreview.update,
    hidePreview: dropPreview.hide,
    attach,
    detach,
    select,
    screenToFloorMm,
    snapDropPoint,
    focusArea,
    setDoorsOpen,
  };
}
