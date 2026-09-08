import { Vector2 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SNAP,
  SnapEngine,
  normalToRotationDeg,
  projectOnSegment,
  type SnapTarget,
  type WallSnapTarget,
} from './SnapEngine';

const config = (mmPerPixel: number, over: Partial<typeof DEFAULT_SNAP> = {}) => ({
  ...DEFAULT_SNAP,
  ...over,
  mmPerPixel,
});

/** Стена вдоль оси X длиной 4 м, внутренняя сторона — в плюс по Z. */
const northWall = (over: Partial<WallSnapTarget> = {}): WallSnapTarget => ({
  kind: 'wall',
  a: new Vector2(-2000, 0),
  b: new Vector2(2000, 0),
  normal: new Vector2(0, 1),
  halfThicknessMm: 50,
  sourceId: 'w1',
  ...over,
});

describe('привязка к точечным целям', () => {
  it('порог задан в пикселях экрана, а не в мм: на разном зуме поведение разное', () => {
    const engine = new SnapEngine();
    engine.setTargets([{ kind: 'object', position: new Vector2(1000, 0), sourceId: 'o1' }]);

    const desired = new Vector2(1100, 0); // 100 мм от цели
    // Отдалённая камера: 12 px * 10 мм = 120 мм порога — притягиваем
    expect(engine.snap(desired, config(10)).snapped).toBe(true);
    // Приближённая камера: 12 px * 2 мм = 24 мм — не притягиваем
    expect(engine.snap(desired, config(2)).snapped).toBe(false);
  });

  it('выбирает ближайшую цель из нескольких', () => {
    const engine = new SnapEngine();
    engine.setTargets([
      { kind: 'object', position: new Vector2(0, 0), sourceId: 'far' },
      { kind: 'object', position: new Vector2(90, 0), sourceId: 'near' },
    ]);

    expect(engine.snap(new Vector2(100, 0), config(10)).target?.sourceId).toBe('near');
  });

  it('переносит угол выравнивания с цели', () => {
    const engine = new SnapEngine();
    engine.setTargets([{ kind: 'object', position: new Vector2(0, 0), rotation: 90 }]);
    expect(engine.snap(new Vector2(10, 0), config(10)).rotation).toBe(90);
  });

  it('уважает выключенные типы целей', () => {
    const engine = new SnapEngine();
    engine.setTargets([{ kind: 'object', position: new Vector2(1000, 0) }]);

    const result = engine.snap(new Vector2(1010, 0), config(10, { enableObjects: false }));
    expect(result.target?.kind).not.toBe('object');
  });
});

describe('привязка к стенам', () => {
  it('ставит объект вплотную к внутренней грани', () => {
    const engine = new SnapEngine();
    engine.setTargets([northWall()]);

    // Шкаф глубиной 600: центр должен встать в 50 (полстены) + 300 = 350
    const result = engine.snap(new Vector2(500, 420), config(10, { objectHalfDepthMm: 300 }));

    expect(result.snapped).toBe(true);
    expect(result.position.x).toBe(500);
    expect(result.position.y).toBe(350);
  });

  it('разворачивает объект спиной к стене', () => {
    const engine = new SnapEngine();
    engine.setTargets([northWall()]);

    const result = engine.snap(new Vector2(0, 360), config(10, { objectHalfDepthMm: 300 }));
    // Нормаль (0,1): фасад смотрит вдоль +Z плана, поворот нулевой
    expect(result.rotation).toBe(0);
  });

  it('привязка работает в любом месте вдоль стены, а не только у середины', () => {
    const engine = new SnapEngine();
    engine.setTargets([northWall()]);

    for (const x of [-1900, -500, 0, 900, 1950]) {
      const result = engine.snap(new Vector2(x, 380), config(10, { objectHalfDepthMm: 300 }));
      expect(result.snapped).toBe(true);
      expect(result.position.x).toBe(x);
    }
  });

  it('не притягивает за торцом стены', () => {
    const engine = new SnapEngine();
    engine.setTargets([northWall()]);

    // Точка далеко за концом отрезка: проекция обрезается концом,
    // и позиция постановки оказывается за порогом
    const result = engine.snap(new Vector2(4000, 350), config(10, { objectHalfDepthMm: 300 }));
    expect(result.target?.kind).not.toBe('wall');
  });

  it('стена важнее объекта при равном расстоянии', () => {
    const engine = new SnapEngine();
    engine.setTargets([
      northWall(),
      { kind: 'object', position: new Vector2(0, 360), sourceId: 'o1' },
    ]);

    const result = engine.snap(new Vector2(0, 360), config(10, { objectHalfDepthMm: 300 }));
    expect(result.target?.kind).toBe('wall');
  });

  it('учитывает толщину стены в смещении', () => {
    const engine = new SnapEngine();
    engine.setTargets([northWall({ halfThicknessMm: 200 })]);

    const result = engine.snap(new Vector2(0, 500), config(10, { objectHalfDepthMm: 300 }));
    expect(result.position.y).toBe(500);
  });

  it('внутренняя нормаль задаёт сторону постановки', () => {
    const engine = new SnapEngine();
    engine.setTargets([northWall({ normal: new Vector2(0, -1) })]);

    const result = engine.snap(new Vector2(0, -360), config(10, { objectHalfDepthMm: 300 }));
    expect(result.position.y).toBe(-350);
    expect(result.rotation).toBe(180);
  });

  it('выключение стен убирает их из кандидатов', () => {
    const engine = new SnapEngine();
    engine.setTargets([northWall()]);

    const result = engine.snap(
      new Vector2(0, 355),
      config(10, { objectHalfDepthMm: 300, enableWalls: false }),
    );
    expect(result.target?.kind).not.toBe('wall');
  });
});

describe('запасная привязка к сетке', () => {
  it('без целей округляет до шага сетки и не даёт тактильный отклик', () => {
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
    const result = engine.snap(desired, config(10, { enableGrid: false }));

    expect(result.position.equals(desired)).toBe(true);
    expect(result.target).toBeNull();
  });
});

describe('вспомогательная геометрия', () => {
  it('проекция на отрезок обрезается его концами', () => {
    const a = new Vector2(0, 0);
    const b = new Vector2(1000, 0);
    expect(projectOnSegment(new Vector2(500, 400), a, b).x).toBe(500);
    expect(projectOnSegment(new Vector2(-900, 0), a, b).x).toBe(0);
    expect(projectOnSegment(new Vector2(5000, 0), a, b).x).toBe(1000);
  });

  it('вырожденный отрезок не даёт NaN', () => {
    const a = new Vector2(10, 20);
    expect(projectOnSegment(new Vector2(0, 0), a, a.clone()).equals(a)).toBe(true);
  });

  it('нормаль переводится в угол поворота', () => {
    expect(normalToRotationDeg(new Vector2(0, 1))).toBe(0);
    expect(normalToRotationDeg(new Vector2(1, 0))).toBe(90);
    expect(Math.abs(normalToRotationDeg(new Vector2(0, -1)))).toBe(180);
    expect(normalToRotationDeg(new Vector2(-1, 0))).toBe(-90);
  });
});
