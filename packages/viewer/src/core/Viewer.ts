import {
  ACESFilmicToneMapping,
  Clock,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
} from 'three';
import { Environment } from './Environment';
import { SelectionIndicator } from './SelectionIndicator';
import { ConflictHighlighter } from './ConflictHighlighter';
import { upwardSurfaceHeightMm } from './surface';
import { RotationGizmo } from '../interaction/RotationGizmo';
import { DrawerController, drawersOf } from '../interaction/DrawerController';
import { DoorController, doorsOf } from '../interaction/DoorController';
import { PlacementPreview } from '../scene/PlacementPreview';
import { MaterialLibrary } from '../scene/MaterialLibrary';
import { DimensionOverlay } from '../scene/DimensionOverlay';
import { SwingOverlay } from '../scene/SwingOverlay';
import { OpeningBuilder } from '../scene/OpeningBuilder';
import { ServiceOverlay } from '../scene/ServiceOverlay';
import type { Object3D } from 'three';
import type { RegisteredInstance } from './SceneRegistry';
import { AssetLoader } from '../loading/AssetLoader';
import { QualityManager } from '../perf/QualityManager';
import { Telemetry } from '../perf/Telemetry';
import { SceneRegistry } from './SceneRegistry';
import type { DeviceTier } from '@furni/shared';

export interface ViewerOptions {
  canvas: HTMLCanvasElement;
  /** Принудительный tier для тестов и перф-гейта */
  forceTier?: DeviceTier;
  onTelemetry?: (snapshot: ReturnType<Telemetry['snapshot']>) => void;
  /** Путь к транскодеру basis для KTX2. По умолчанию /basis/ */
  transcoderPath?: string;
}

/**
 * Ядро рендера. Владеет renderer, scene, camera и циклом кадров.
 *
 * ВАЖНО: этот класс и всё, что он держит, никогда не попадает в реактивность Vue.
 * Наружу отдаётся только через markRaw(). См. CLAUDE.md, правило 1.
 */
export class Viewer {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly registry: SceneRegistry;
  readonly environment: Environment;
  readonly assets: AssetLoader;
  readonly selection: SelectionIndicator;
  readonly conflicts: ConflictHighlighter;
  readonly rotation: RotationGizmo;
  readonly preview: PlacementPreview;
  /** Размерные линии помещения */
  readonly dimensions: DimensionOverlay;
  /** Зоны открывания дверей */
  readonly swings: SwingOverlay;
  /** Двери и окна в проёмах */
  readonly openings: OpeningBuilder;
  /** Метки инженерии: розетки, вода, вентиляция */
  readonly services: ServiceOverlay;
  /** Выдвижные ящики загруженных моделей */
  readonly drawers = new DrawerController();
  /** Распашные дверцы загруженных моделей */
  readonly doors = new DoorController();
  /** Материалы тенанта для смены отделки */
  readonly materials = new MaterialLibrary();
  readonly quality: QualityManager;
  readonly telemetry: Telemetry;

  private readonly clock = new Clock();
  private readonly raycaster = new Raycaster();
  private rafId: number | null = null;
  private disposed = false;
  private firstFrameTime: number | null = null;
  /** Был ли отрисован предыдущий кадр — см. Telemetry.record */
  private previousFrameRendered = false;
  private needsRender = true;
  private readonly updateCallbacks = new Set<(dt: number) => void>();
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly options: ViewerOptions) {
    const { canvas } = options;

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false, // включается адаптивно в QualityManager
      alpha: false,
      powerPreference: 'high-performance',
      // Отключаем, чтобы не платить за копию буфера. Скриншоты — через
      // отложенный рендер с preserveDrawingBuffer:true в отдельном проходе.
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    // Тени в интерактивном режиме выключены осознанно (ТЗ 7.4).
    this.renderer.shadowMap.enabled = false;

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(50, 1, 0.05, 200);
    this.camera.position.set(4, 3, 4);
    // Смотрим в центр комнаты на высоте пояса, иначе сцена уезжает за кадр
    this.camera.lookAt(0, 0.8, 0);

    this.registry = new SceneRegistry(this.scene);
    this.environment = new Environment(this.scene, this.renderer);
    this.selection = new SelectionIndicator(this.scene);
    this.conflicts = new ConflictHighlighter(this.scene);
    this.rotation = new RotationGizmo(this.scene);
    this.preview = new PlacementPreview(this.scene);
    this.dimensions = new DimensionOverlay(this.scene);
    this.swings = new SwingOverlay(this.scene);
    this.openings = new OpeningBuilder(this.scene);
    this.services = new ServiceOverlay(this.scene);
    this.telemetry = new Telemetry();
    this.quality = new QualityManager(this.renderer, this.telemetry, options.forceTier);
    // Загрузчик держит кэш моделей и зависит от бюджета видеопамяти
    // текущего класса устройства, поэтому создаётся после QualityManager
    this.assets = new AssetLoader(this.renderer, {
      transcoderPath: options.transcoderPath ?? '/basis/',
      maxTextureBytes: this.quality.budget.maxTextureBytes,
    });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas);
    this.handleResize();
  }

  /**
   * Объект под экранной точкой в нормализованных координатах устройства.
   *
   * Луч проверяется по всем зарегистрированным объектам, попадание в любую
   * вложенную деталь разрешается во владельца через реестр: пользователь
   * целится в дверцу шкафа, а выделяется шкаф целиком.
   */
  pick(ndc: Vector2, excludeInstanceId?: string): RegisteredInstance | null {
    const roots = [...this.registry.all()].map((instance) => instance.root);
    if (roots.length === 0) return null;

    this.raycaster.setFromCamera(ndc, this.camera);
    for (const hit of this.raycaster.intersectObjects(roots, true)) {
      const owner = this.registry.resolve(hit.object);
      if (owner && owner.instanceId !== excludeInstanceId) return owner;
    }
    return null;
  }

  /**
   * Высота опорной поверхности под экранной точкой, миллиметры.
   * Ноль означает пол.
   *
   * Опора выбирается лучом, а не габаритами в плане: пользователь видит
   * поверхность, в которую целится, и вещь должна лечь именно на неё.
   * По габаритам мелочь, брошенная под навесным шкафом, забиралась бы
   * ему на верх, потому что в плане шкаф оказывается «под точкой».
   *
   * Годится только грань, смотрящая вверх: прицел в бок или фасад тумбы
   * не означает постановку на её крышку. Луч идёт дальше и ищет
   * следующую подходящую поверхность.
   */
  supportTopMm(ndc: Vector2, excludeInstanceId?: string): number {
    const roots = [...this.registry.all()].map((instance) => instance.root);
    if (roots.length === 0) return 0;

    this.raycaster.setFromCamera(ndc, this.camera);
    const height = upwardSurfaceHeightMm(
      this.raycaster.intersectObjects(roots, true),
      (object) => {
        const owner = this.registry.resolve(object);
        return owner !== undefined && owner.instanceId !== excludeInstanceId;
      },
    );
    return height ?? 0;
  }

  /**
   * Размерная линия под экранной точкой.
   *
   * Проверяется раньше объектов каталога: подпись лежит поверх мебели,
   * и тап по видимой плашке обязан попасть именно в неё.
   */
  pickDimension(ndc: Vector2): { id: string; lengthMm: number } | null {
    const targets = this.dimensions.targets;
    if (targets.length === 0 || !this.dimensions.visible) return null;

    this.raycaster.setFromCamera(ndc, this.camera);
    for (const hit of this.raycaster.intersectObjects(targets, false)) {
      const found = this.dimensions.resolve(hit.object);
      if (found) return found;
    }
    return null;
  }

  /**
   * Дверца модели под экранной точкой.
   *
   * Как и с ящиком, ищется только среди дверец переданного объекта: тап
   * по чужому фасаду не должен открывать ничего.
   */
  pickDoor(ndc: Vector2, root: Object3D): Object3D | null {
    const doors = doorsOf(root);
    if (doors.length === 0) return null;

    this.raycaster.setFromCamera(ndc, this.camera);
    for (const hit of this.raycaster.intersectObjects(doors, true)) {
      const owner = doors.find((door) => isDescendant(hit.object, door));
      if (owner) return owner;
    }
    return null;
  }

  /**
   * Ящик модели под экранной точкой.
   *
   * Ищется только среди ящиков переданного объекта: выдвигать ящик
   * можно у выделенного изделия, и тап по чужому фасаду не должен
   * открывать ничего.
   */
  pickDrawer(ndc: Vector2, root: Object3D): Object3D | null {
    const drawers = drawersOf(root);
    if (drawers.length === 0) return null;

    this.raycaster.setFromCamera(ndc, this.camera);
    for (const hit of this.raycaster.intersectObjects(drawers, true)) {
      // Попасть можно в любую деталь ящика — короб, фронт или ручку
      const owner = drawers.find((drawer) => isDescendant(hit.object, drawer));
      if (owner) return owner;
    }
    return null;
  }

  /**
   * Метка инженерии под экранной точкой.
   *
   * Проверяется раньше всего: метка мелкая, лежит на стене и на полу, и
   * попасть по ней иначе невозможно.
   */
  pickService(ndc: Vector2): string | null {
    const targets = this.services.targets;
    if (targets.length === 0 || !this.services.root.visible) return null;

    this.raycaster.setFromCamera(ndc, this.camera);
    for (const hit of this.raycaster.intersectObjects(targets, false)) {
      const id = this.services.resolve(hit.object);
      if (id) return id;
    }
    return null;
  }

  /**
   * Изделие в проёме под экранной точкой.
   *
   * Проверяется отдельно от мебели: дверь не зарегистрирована в реестре
   * сцены — она часть планировки, а не размещённый товар.
   */
  pickOpening(ndc: Vector2): string | null {
    const targets = this.openings.targets;
    if (targets.length === 0) return null;

    this.raycaster.setFromCamera(ndc, this.camera);
    for (const hit of this.raycaster.intersectObjects(targets, true)) {
      const id = this.openings.resolve(hit.object);
      if (id) return id;
    }
    return null;
  }

  /**
   * Попадает ли луч в конкретный объект — например, в кольцо поворота.
   * Отдельно от pick: манипуляторы не зарегистрированы в реестре сцены.
   */
  intersects(ndc: Vector2, object: Object3D): boolean {
    if (!object.visible) return false;
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.intersectObject(object, true).length > 0;
  }

  /**
   * Время первого отрисованного кадра (performance.now), null до него.
   * Используется перф-гейтом для замера TTFF (LOAD_BUDGETS.timeToFirstFrameMs).
   */
  get firstFrameAt(): number | null {
    return this.firstFrameTime;
  }

  /** Помечает кадр как требующий перерисовки. Рендер по требованию экономит батарею. */
  invalidate(): void {
    this.needsRender = true;
  }

  onUpdate(fn: (dt: number) => void): () => void {
    this.updateCallbacks.add(fn);
    return () => this.updateCallbacks.delete(fn);
  }

  start(): void {
    if (this.rafId !== null || this.disposed) return;
    this.clock.start();
    const loop = () => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(loop);
      this.frame();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private frame(): void {
    const dt = this.clock.getDelta();
    const frameStart = performance.now();

    for (const fn of this.updateCallbacks) fn(dt);
    // Ход ящика — единственная анимация вьюера: пока она идёт,
    // кадры нужны каждый, иначе движение застынет на полпути
    if (this.drawers.update(dt)) this.needsRender = true;
    if (this.doors.update(dt)) this.needsRender = true;

    const rendered = this.needsRender;
    if (rendered) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
      this.firstFrameTime ??= performance.now();
    }

    const cpuMs = performance.now() - frameStart;
    // Интервал между кадрами осмыслен только если оба были отрисованы
    this.telemetry.record(dt, cpuMs, this.renderer.info, rendered && this.previousFrameRendered);
    this.previousFrameRendered = rendered;
    this.quality.tick();

    const snapshot = this.telemetry.maybeEmit();
    if (snapshot) this.options.onTelemetry?.(snapshot);
  }

  private handleResize(): void {
    const { canvas } = this.options;
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.setSize(width, height, false);
    this.invalidate();
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    this.resizeObserver.disconnect();
    this.updateCallbacks.clear();
    this.registry.disposeAll();
    this.assets.dispose();
    this.selection.dispose();
    this.conflicts.dispose();
    this.rotation.dispose();
    this.drawers.dispose();
    this.doors.dispose();
    this.preview.dispose();
    this.dimensions.dispose();
    this.swings.dispose();
    this.openings.dispose();
    this.services.dispose();
    this.materials.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** Лежит ли объект в поддереве узла. */
function isDescendant(object: Object3D, root: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (node === root) return true;
  }
  return false;
}
