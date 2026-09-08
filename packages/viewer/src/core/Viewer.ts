import {
  ACESFilmicToneMapping,
  Clock,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { QualityManager } from '../perf/QualityManager';
import { Telemetry } from '../perf/Telemetry';
import { SceneRegistry } from './SceneRegistry';
import type { DeviceTier } from '@furni/shared';

export interface ViewerOptions {
  canvas: HTMLCanvasElement;
  /** Принудительный tier для тестов и перф-гейта */
  forceTier?: DeviceTier;
  onTelemetry?: (snapshot: ReturnType<Telemetry['snapshot']>) => void;
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
  readonly quality: QualityManager;
  readonly telemetry: Telemetry;

  private readonly clock = new Clock();
  private rafId: number | null = null;
  private disposed = false;
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

    this.registry = new SceneRegistry(this.scene);
    this.telemetry = new Telemetry();
    this.quality = new QualityManager(this.renderer, this.telemetry, options.forceTier);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(canvas);
    this.handleResize();
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

    if (this.needsRender) {
      this.renderer.render(this.scene, this.camera);
      this.needsRender = false;
    }

    const cpuMs = performance.now() - frameStart;
    this.telemetry.record(dt, cpuMs, this.renderer.info);
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
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
