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
  groupIntoChains,
  hasConflicts,
  innerNormal,
  normalizeAngleDeg,
  placementBox,
  planAngleDeg,
  restingHeightMm,
  supportTopMm,
  swingZones,
  type Box,
  type CatalogProduct,
  type ConflictReport,
  type Placement,
  type SwingZone,
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

/** Тап по размерной линии: стена, её текущий размер и место для поля ввода. */
export interface DimensionHit {
  wallId: string;
  clearLengthMm: number;
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

  /**
   * Попадание в выделение: сам объект или кольцо поворота вокруг него.
   *
   * Кольцо обязано считаться выделением, иначе GestureController отдаст
   * жест камере и поворот превратится в облёт сцены.
   */
  function hitTestSelection(point: Vector2): boolean {
    const v = viewer.value;
    if (!selectedId.value || !v) return false;

    const ndc = toNdc(point);
    if (v.intersects(ndc, v.rotation.mesh)) return true;
    return v.pick(ndc)?.instanceId === selectedId.value;
  }

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

  /** Размещение выделенного объекта из документа сцены. */
  function selectedPlacement(): Placement | undefined {
    return scene.doc.placements.find((p) => p.instanceId === selectedId.value);
  }

  /** Все стены документа одним списком. */
  function allWalls(): Wall[] {
    return scene.doc.rooms.flatMap((room) => room.walls);
  }

  /** Зоны открывания всех дверей документа. */
  function allSwings(): SwingZone[] {
    return scene.doc.rooms.flatMap((room) => swingZones(room));
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
  let dragSwings: SwingZone[] = [];

  /** Что делает текущий жест: двигает объект или вращает его. */
  let dragKind: 'move' | 'rotate' = 'move';
  let rotateCentreMm = new Vector2();
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

  /**
   * Цели привязки: стены помещения и габариты остальных объектов.
   * Габарит превращает соседа в цель СТЫКОВКИ: модуль встаёт грань
   * в грань, а не центром в центр.
   */
  function beginDrag(
    exceptId: string | null = selectedId.value,
    grabPoint?: Vector2,
  ): void {
    // Прямоугольник канваса обновляется на старте жеста, а не на каждое
    // движение: ResizeObserver ловит не всё — панель каталога может
    // подгрузиться и сдвинуть сцену без изменения её размеров, и тогда
    // луч уходит мимо цели, в которую целится пользователь
    refreshRect();
    captureGrabOffset(grabPoint);

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

    staticBoxes = otherBoxes(exceptId);

    // Цели строятся по ЦЕПОЧКАМ, а не по отдельным модулям: ряд кухни
    // это один фронт, и столешницу выравнивают по краю всего ряда,
    // а не по краю случайной тумбы внутри него. Одиночный модуль —
    // цепочка из одного, поэтому для отдельной мебели ничего не меняется.
    for (const chain of groupIntoChains(staticBoxes)) {
      targets.push({
        kind: 'object',
        position: new Vector2(chain.box.centre.x, chain.box.centre.y),
        rotation: chain.box.rotationDeg,
        sourceId: chain.memberIds[0] ?? '',
        footprint: {
          halfWidthMm: chain.box.halfWidthMm,
          halfDepthMm: chain.box.halfDepthMm,
          // Высоты решают, стыковать сбоку или выравнивать поверх:
          // столешница и верхний шкаф ложатся НАД нижним рядом
          bottomMm: chain.box.bottomMm,
          topMm: chain.box.topMm,
        },
      });
    }

    snapEngine.value.setTargets(targets);
    dragWalls = allWalls();
    dragSwings = allSwings();
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
      v.supportTopMm(toNdc(clientPoint), excludeInstanceId),
    );
  }

  /** Запоминает, за какую точку объекта взялись. */
  function captureGrabOffset(grabPoint?: Vector2): void {
    grabOffsetMm.set(0, 0);

    const instance = selectedId.value ? viewer.value?.registry.get(selectedId.value) : undefined;
    if (!instance || !grabPoint) return;

    // Захват меряется в плоскости, где объект сейчас стоит: для вещи
    // на столешнице пол это не та плоскость
    const hit = floorPointAt(grabPoint, instance.root.position.y * 1000);
    if (!hit) return;

    grabOffsetMm.set(
      instance.root.position.x * 1000 - hit.x,
      instance.root.position.z * 1000 - hit.z,
    );
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
      v?.conflicts.clear();
      return;
    }

    const box = subject ?? documentBox(id);
    if (!box) {
      conflicts.value = EMPTY_CONFLICTS;
      v?.selection.setConflict(false);
      v?.conflicts.clear();
      return;
    }

    const neighbours = subject ? staticBoxes : otherBoxes(id);
    const walls = subject ? dragWalls : allWalls();
    const swings = subject ? dragSwings : allSwings();

    conflicts.value = findConflicts(box, neighbours, walls, undefined, swings);
    v?.selection.setConflict(hasConflicts(conflicts.value));
    highlightConflicting(conflicts.value.objectIds);
    v?.invalidate();
  }

  /** Подсветить сами конфликтующие объекты, а не только рамку выделения. */
  function highlightConflicting(instanceIds: readonly string[]): void {
    const v = viewer.value;
    if (!v) return;

    const roots = instanceIds
      .map((id) => v.registry.get(id)?.root)
      .filter((root): root is NonNullable<typeof root> => root !== undefined);
    v.conflicts.show(roots);
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
        // Размер проверяется раньше объектов: плашка нарисована поверх
        // мебели, и тап по видимой подписи должен попадать в неё
        const dimension = v.pickDimension(toNdc(e.point));
        options.onDimensionTap?.(
          dimension ? { ...dimension, clientX: e.point.x, clientY: e.point.y } : null,
        );
        if (dimension) break;

        const hit = v.pick(toNdc(e.point));
        // Ящик выдвигается тапом по уже выделенному изделию: первый тап
        // выбирает объект, и открывать ящик заодно с выбором нельзя —
        // пользователь ещё не показал, что хочет заглянуть внутрь
        if (hit && hit.instanceId === selectedId.value) {
          const drawer = v.pickDrawer(toNdc(e.point), hit.root);
          if (drawer) {
            v.drawers.toggle(drawer);
            v.invalidate();
            break;
          }
        }

        select(hit?.instanceId ?? null);
        break;
      }

      case 'dragStart':
        if (!e.onSelection) break;
        dragKind = v.intersects(toNdc(e.point), v.rotation.mesh) ? 'rotate' : 'move';
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
        if (e.onSelection && selectedId.value) {
          commitSelectedPosition();
        }
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

  function moveSelected(screenPoint: Vector2): void {
    const v = viewer.value;
    if (!v || !camera || !selectedId.value) return;
    const instance = v.registry.get(selectedId.value);
    if (!instance || instance.locked) return;

    const product = catalog.bySku.get(selectedPlacement()?.sku ?? '');
    // Высота берётся из того, во что целится указатель. Считается ПЕРВОЙ:
    // от неё зависит и плоскость, в которой ищется позиция, и выбор между
    // стыковкой сбоку и выравниванием поверх соседа. Сам перетаскиваемый
    // объект из луча исключён — он следует за курсором и перекрыл бы опору.
    const bottomMm = restingHeightUnder(screenPoint, product, selectedId.value);

    const hit = floorPointAt(screenPoint, bottomMm);
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

    // Прямая мутация Three.js. В Pinia НЕ пишем — это горячий путь.
    instance.root.position.set(
      result.position.x / 1000,
      bottomMm / 1000,
      result.position.y / 1000,
    );
    if (result.rotation !== null) {
      instance.root.rotation.y = (result.rotation * Math.PI) / 180;
    }
    v.selection.refresh(instance.root);
    v.rotation.update(instance.root);
    updateConflicts(liveBox(selectedId.value) ?? undefined);
  }

  /**
   * Начало поворота. Запоминаются угол указателя и угол объекта: дальше
   * применяется их разница, поэтому объект не прыгает под курсор в момент
   * захвата кольца.
   */
  function beginRotate(point: Vector2): void {
    const v = viewer.value;
    const instance = selectedId.value ? v?.registry.get(selectedId.value) : undefined;
    const floor = floorPointAt(point);
    if (!instance || !floor) return;

    rotateCentreMm.set(instance.root.position.x * 1000, instance.root.position.z * 1000);
    rotatePointerStartDeg = planAngleDeg(floor.x - rotateCentreMm.x, floor.z - rotateCentreMm.y);
    rotateObjectStartDeg = (instance.root.rotation.y * 180) / Math.PI;

    // Соседи на время жеста не меняются: конфликты считаются по кэшу
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
    const instance = selectedId.value ? v?.registry.get(selectedId.value) : undefined;
    const floor = floorPointAt(point);
    if (!v || !instance || !floor || instance.locked) return;

    const pointerDeg = planAngleDeg(floor.x - rotateCentreMm.x, floor.z - rotateCentreMm.y);
    const delta = normalizeAngleDeg(pointerDeg - rotatePointerStartDeg);
    const next = rotateObjectStartDeg + delta;

    // Прямая мутация Three.js: в Pinia пишем один раз на dragEnd
    instance.root.rotation.y = (next * Math.PI) / 180;

    v.selection.refresh(instance.root);
    v.rotation.update(instance.root);
    updateConflicts(liveBox(selectedId.value!) ?? undefined);
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

    // Первое событие серии: обновляем кэш соседей для проверки конфликтов
    if (rotationCommitTimer === null) beginDrag(id);

    instance.root.rotation.y += (deltaDeg * Math.PI) / 180;
    v.selection.refresh(instance.root);
    v.rotation.update(instance.root);
    updateConflicts(liveBox(id) ?? undefined);

    if (rotationCommitTimer) clearTimeout(rotationCommitTimer);
    rotationCommitTimer = setTimeout(() => {
      rotationCommitTimer = null;
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

  /**
   * Точка под координатой окна на горизонтальной плоскости высоты
   * `heightMm`, в мм. null — луч ушёл выше горизонта.
   *
   * Высота плоскости обязана совпадать с высотой постановки: луч,
   * нацеленный на крышку тумбы, пересекает пол далеко за ней, и позиция,
   * посчитанная по полу, уехала бы на метры от точки прицеливания.
   */
  function floorPointAt(clientPoint: Vector2, heightMm = 0): FloorPoint | null {
    if (!camera) return null;
    const hit = camera.projectToPlane(toNdc(clientPoint), heightMm / 1000);
    return hit ? { x: hit.x * 1000, z: hit.z * 1000 } : null;
  }

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
  ): { x: number; z: number; y: number; rotationY: number } | null {
    const clientPoint = new Vector2(clientX, clientY);
    if (!camera) return null;

    // Исключать нечего: бросаемого объекта в документе ещё нет, а ранее
    // выделенный сосед — как раз тот, к которому надо пристыковаться
    beginDrag(null);

    // Сначала высота, потом позиция в плоскости этой высоты
    const bottomMm = restingHeightUnder(clientPoint, product);
    const point = floorPointAt(clientPoint, bottomMm);
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

    return {
      x: result.position.x,
      z: result.position.y,
      y: bottomMm,
      rotationY: result.rotation ?? 0,
    };
  }

  // ---------------------------------------------------------------------
  // Предварительное положение при переносе из каталога
  // ---------------------------------------------------------------------

  /** Куда встанет объект и с каким разворотом. null — переноса нет. */
  const preview = shallowRef<{
    xMm: number;
    yMm: number;
    zMm: number;
    rotationDeg: number;
  } | null>(null);
  const previewConflicts = shallowRef<ConflictReport>(EMPTY_CONFLICTS);

  let previewSku: string | null = null;
  let previewRef: { productId: string; urlTemplate: string } | null = null;

  /**
   * Обновление призрака под указателем.
   *
   * Точка отпускания и место постановки различаются: работают привязка
   * к стене, стыковка с соседом и высота установки. Без призрака перенос
   * получается вслепую.
   */
  async function updatePreview(
    product: CatalogProduct,
    clientX: number,
    clientY: number,
  ): Promise<void> {
    const v = viewer.value;
    if (!v) return;

    const point = snapDropPoint(product, clientX, clientY);
    if (!point) {
      hidePreview();
      return;
    }

    if (previewSku !== product.sku) {
      previewSku = product.sku;
      const ref = { productId: product.sku, urlTemplate: product.urlTemplate };
      // Превью грузится в самом лёгком LOD: оно живёт доли секунды,
      // а полная модель на слабом устройстве не успеет появиться
      const group = await v.assets.load(ref, 2);
      // Пока грузили, пользователь мог схватить другой товар
      if (previewSku !== product.sku) return;

      releasePreviewAsset();
      previewRef = ref;
      v.preview.show(group);
    }

    v.preview.setTransform(point.x, point.y, point.z, point.rotationY);
    preview.value = {
      xMm: Math.round(point.x),
      yMm: Math.round(point.y),
      zMm: Math.round(point.z),
      rotationDeg: Math.round(point.rotationY),
    };

    const box: Box = {
      centre: { x: point.x, y: point.z },
      halfWidthMm: product.widthMm / 2,
      halfDepthMm: product.depthMm / 2,
      rotationDeg: point.rotationY,
      bottomMm: point.y,
      topMm: point.y + product.heightMm,
    };
    previewConflicts.value = findConflicts(box, otherBoxes(null), allWalls(), undefined, allSwings());
    v.preview.setConflict(hasConflicts(previewConflicts.value));
    // Виновник подсвечивается и до отпускания: пользователь видит, во что
    // упрётся объект, ещё на подлёте
    highlightConflicting(previewConflicts.value.objectIds);
    v.invalidate();
  }

  function hidePreview(): void {
    const v = viewer.value;
    v?.preview.hide();
    v?.conflicts.clear();
    releasePreviewAsset();
    previewSku = null;
    preview.value = null;
    previewConflicts.value = EMPTY_CONFLICTS;
    v?.invalidate();
  }

  /** Счётчик ссылок загрузчика: без возврата модель никогда не вытеснится. */
  function releasePreviewAsset(): void {
    if (previewRef) viewer.value?.assets.release(previewRef, 2);
    previewRef = null;
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
    if (rotationCommitTimer) clearTimeout(rotationCommitTimer);
    rotationCommitTimer = null;
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
    preview,
    previewConflicts,
    updatePreview,
    hidePreview,
    attach,
    detach,
    select,
    screenToFloorMm,
    snapDropPoint,
    focusArea,
  };
}
