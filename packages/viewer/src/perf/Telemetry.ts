import type { WebGLRenderer } from 'three';

export interface TelemetrySnapshot {
  fpsP50: number;
  fpsP95: number;
  fpsMin: number;
  cpuFrameMsP95: number;
  drawCalls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
  sampleCount: number;
}

const WINDOW_SIZE = 180; // ~3 секунды при 60 fps
const EMIT_INTERVAL_MS = 5000;

/**
 * Скользящее окно метрик кадра. Без клиентской телеметрии
 * производительности продукт неуправляем (ТЗ, раздел 13).
 */
export class Telemetry {
  private readonly frameTimes = new Float32Array(WINDOW_SIZE);
  private readonly cpuTimes = new Float32Array(WINDOW_SIZE);
  private cursor = 0;
  private filled = 0;
  private lastEmit = 0;
  private info: WebGLRenderer['info'] | null = null;

  record(dt: number, cpuMs: number, info: WebGLRenderer['info']): void {
    // Игнорируем аномальные кадры после возврата из фона
    if (dt > 0 && dt < 1) {
      this.frameTimes[this.cursor] = dt * 1000;
      this.cpuTimes[this.cursor] = cpuMs;
      this.cursor = (this.cursor + 1) % WINDOW_SIZE;
      this.filled = Math.min(this.filled + 1, WINDOW_SIZE);
    }
    this.info = info;
  }

  /** Мгновенный fps по последним кадрам — для QualityManager. */
  recentFps(samples = 60): number {
    if (this.filled === 0) return 60;
    const n = Math.min(samples, this.filled);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor - 1 - i + WINDOW_SIZE) % WINDOW_SIZE;
      sum += this.frameTimes[idx];
    }
    return 1000 / (sum / n);
  }

  snapshot(): TelemetrySnapshot {
    const times = Array.from(this.frameTimes.slice(0, this.filled)).sort((a, b) => a - b);
    const cpu = Array.from(this.cpuTimes.slice(0, this.filled)).sort((a, b) => a - b);
    const pct = (arr: number[], p: number): number =>
      arr.length === 0 ? 0 : arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];

    // Медленный кадр = низкий fps, поэтому перцентили fps инвертированы
    const toFps = (ms: number): number => (ms > 0 ? 1000 / ms : 0);

    return {
      fpsP50: round(toFps(pct(times, 0.5))),
      fpsP95: round(toFps(pct(times, 0.95))),
      fpsMin: round(toFps(times[times.length - 1] ?? 0)),
      cpuFrameMsP95: round(pct(cpu, 0.95)),
      drawCalls: this.info?.render.calls ?? 0,
      triangles: this.info?.render.triangles ?? 0,
      programs: this.info?.programs?.length ?? 0,
      geometries: this.info?.memory.geometries ?? 0,
      textures: this.info?.memory.textures ?? 0,
      sampleCount: this.filled,
    };
  }

  maybeEmit(): TelemetrySnapshot | null {
    const now = performance.now();
    if (now - this.lastEmit < EMIT_INTERVAL_MS) return null;
    if (this.filled < 30) return null;
    this.lastEmit = now;
    return this.snapshot();
  }
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}
