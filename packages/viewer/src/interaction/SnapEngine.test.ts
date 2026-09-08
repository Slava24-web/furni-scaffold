import { Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SNAP, SnapEngine, type SnapTarget } from './SnapEngine';

const config = (mmPerPixel: number) => ({ ...DEFAULT_SNAP, mmPerPixel });

describe('SnapEngine', () => {
  it('порог задан в пикселях экрана, а не в мм: на разном зуме поведение разное', () => {
    const engine = new SnapEngine();
    const wall: SnapTarget = { kind: 'wall', position: new Vector2(1000, 0), sourceId: 'w1' };
    engine.setTargets([wall]);

    const desired = new Vector2(1100, 0); // 100 мм от цели
    // Отдалённая камера: 12 px * 10 мм = 120 мм порога — притягиваем
    expect(engine.snap(desired, config(10)).snapped).toBe(true);
    // Приближённая камера: 12 px * 2 мм = 24 мм — не притягиваем
    expect(engine.snap(desired, config(2)).snapped).toBe(false);
  });

  it('выбирает ближайшую цель из нескольких', () => {
    const engine = new SnapEngine();
    engine.setTargets([
      { kind: 'wall', position: new Vector2(0, 0), sourceId: 'far' },
      { kind: 'object', position: new Vector2(90, 0), sourceId: 'near' },
    ]);

    const result = engine.snap(new Vector2(100, 0), config(10));
    expect(result.target?.sourceId).toBe('near');
  });

  it('уважает выключенные типы целей', () => {
    const engine = new SnapEngine();
    engine.setTargets([{ kind: 'wall', position: new Vector2(1000, 0), sourceId: 'w1' }]);

    const result = engine.snap(new Vector2(1010, 0), {
      ...config(10),
      enableWalls: false,
    });
    expect(result.target?.kind).not.toBe('wall');
  });

  it('переносит угол выравнивания с цели', () => {
    const engine = new SnapEngine();
    engine.setTargets([{ kind: 'wall', position: new Vector2(0, 0), rotation: 90, sourceId: 'w1' }]);

    expect(engine.snap(new Vector2(10, 0), config(10)).rotation).toBe(90);
  });

  it('без целей падает на сетку и не даёт тактильный отклик', () => {
    const engine = new SnapEngine();
    const result = engine.snap(new Vector2(1237, 862), config(10));

    expect(result.position.x).toBe(1250);
    expect(result.position.y).toBe(850);
    // Сетка срабатывает почти всегда — вибрация на каждый шаг недопустима
    expect(result.snapped).toBe(false);
  });

  it('с выключенной сеткой возвращает исходную точку без изменений', () => {
    const engine = new SnapEngine();
    const desired = new Vector2(1237, 862);
    const result = engine.snap(desired, { ...config(10), enableGrid: false });

    expect(result.position.equals(desired)).toBe(true);
    expect(result.target).toBeNull();
  });
});
