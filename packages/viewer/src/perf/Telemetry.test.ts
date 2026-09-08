import { describe, expect, it } from 'vitest';
import { Telemetry } from './Telemetry';

/** Заглушка renderer.info: телеметрии от неё нужны только счётчики. */
const info = (calls = 12, triangles = 4200) =>
  ({
    render: { calls, triangles, frame: 0, lines: 0, points: 0 },
    memory: { geometries: 7, textures: 3 },
    programs: [{}, {}],
  }) as unknown as Parameters<Telemetry['record']>[2];

const feed = (telemetry: Telemetry, frameMs: number, count: number, sample = true): void => {
  for (let i = 0; i < count; i++) telemetry.record(frameMs / 1000, frameMs * 0.4, info(), sample);
};

describe('Telemetry', () => {
  it('без данных отдаёт нули, а не NaN', () => {
    const snapshot = new Telemetry().snapshot();
    expect(snapshot.fpsP50).toBe(0);
    expect(snapshot.sampleCount).toBe(0);
  });

  it('считает fps по времени кадра', () => {
    const telemetry = new Telemetry();
    feed(telemetry, 16.7, 60);

    const snapshot = telemetry.snapshot();
    expect(snapshot.fpsP50).toBeGreaterThan(59);
    expect(snapshot.fpsP50).toBeLessThan(61);
    expect(snapshot.sampleCount).toBe(60);
  });

  it('не учитывает кадры, помеченные как неотрисованные', () => {
    const telemetry = new Telemetry();
    // Простой при рендере по требованию: 20 длинных кадров без отрисовки
    feed(telemetry, 500, 20, false);
    feed(telemetry, 16.7, 40);

    const snapshot = telemetry.snapshot();
    expect(snapshot.sampleCount).toBe(40);
    // Если бы простой попал в выборку, минимальный fps был бы около 2
    expect(snapshot.fpsMin).toBeGreaterThan(50);
  });

  it('p95 отражает медленные кадры, а не средние', () => {
    const telemetry = new Telemetry();
    feed(telemetry, 16.7, 90);
    feed(telemetry, 50, 10); // просадки

    const snapshot = telemetry.snapshot();
    expect(snapshot.fpsP50).toBeGreaterThan(55);
    expect(snapshot.fpsP95).toBeLessThan(30);
  });

  it('игнорирует аномальные интервалы после возврата вкладки из фона', () => {
    const telemetry = new Telemetry();
    feed(telemetry, 16.7, 30);
    telemetry.record(12, 0.4, info()); // 12 секунд между кадрами

    expect(telemetry.snapshot().sampleCount).toBe(30);
  });

  it('переносит счётчики рендерера в снимок', () => {
    const telemetry = new Telemetry();
    telemetry.record(0.0167, 6, info(41, 30_352));

    const snapshot = telemetry.snapshot();
    expect(snapshot.drawCalls).toBe(41);
    expect(snapshot.triangles).toBe(30_352);
    expect(snapshot.geometries).toBe(7);
  });

  it('maybeEmit молчит, пока не набрана статистика', () => {
    const telemetry = new Telemetry();
    feed(telemetry, 16.7, 10);
    expect(telemetry.maybeEmit()).toBeNull();
  });

  it('recentFps считает по последним кадрам, а не по всему окну', () => {
    const telemetry = new Telemetry();
    feed(telemetry, 50, 100); // давняя просадка
    feed(telemetry, 16.7, 60); // сейчас всё хорошо

    expect(telemetry.recentFps(60)).toBeGreaterThan(55);
  });
});
