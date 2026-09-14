import { describe, expect, it } from 'vitest';
import { NUDGE_STEP_MM, nudge, pushAgainst } from './nudge';
import type { Box } from './box';

/** Нижняя тумба 800×820×560 с центром в точке. */
const base = (x: number, z: number, rotationDeg = 0, over: Partial<Box> = {}): Box => ({
  centre: { x, y: z },
  halfWidthMm: 400,
  halfDepthMm: 280,
  rotationDeg,
  bottomMm: 0,
  topMm: 820,
  ...over,
});

describe('прижать к соседу', () => {
  it('закрывает зазор справа', () => {
    // Центры в 900 при полуширинах 400: зазор 100
    const moved = pushAgainst(base(0, 0), [base(900, 0)], 'right');
    expect(moved).toEqual({ x: 100, y: 0 });
  });

  it('закрывает зазор слева', () => {
    const moved = pushAgainst(base(0, 0), [base(-900, 0)], 'left');
    expect(moved).toEqual({ x: -100, y: 0 });
  });

  it('берёт ближайшего из нескольких', () => {
    const moved = pushAgainst(base(0, 0), [base(1500, 0), base(900, 0)], 'right');
    expect(moved!.x).toBe(100);
  });

  it('сосед за спиной не считается', () => {
    expect(pushAgainst(base(0, 0), [base(-900, 0)], 'right')).toBeNull();
  });

  it('разъехавшийся вбок сосед этой гранью не встречается', () => {
    // Сосед справа, но уехал по глубине на метр: боками они не сойдутся
    expect(pushAgainst(base(0, 0), [base(900, 1000)], 'right')).toBeNull();
  });

  it('навесной шкаф не считается соседом напольного', () => {
    const wall = base(900, 0, 0, { bottomMm: 1450, topMm: 2170 });
    expect(pushAgainst(base(0, 0), [wall], 'right')).toBeNull();
  });

  it('далёкий сосед не притягивается через полкомнаты', () => {
    expect(pushAgainst(base(0, 0), [base(4000, 0)], 'right')).toBeNull();
  });

  it('пересекающийся сосед не двигает объект назад', () => {
    // Уже внахлёст: подгонять нечего, разбирается это выталкиванием
    expect(pushAgainst(base(0, 0), [base(500, 0)], 'right')).toBeNull();
  });

  it('у повёрнутой тумбы «вправо» идёт вдоль её фасада', () => {
    // Поворот на 90°: локальная правая ось смотрит вдоль −Z мира
    const moved = pushAgainst(base(0, 0, 90), [base(0, -900, 90)], 'right');
    expect(moved!.x).toBeCloseTo(0, 6);
    expect(moved!.y).toBeCloseTo(-100, 6);
  });

  it('прижатие к фронту работает так же', () => {
    const moved = pushAgainst(base(0, 0), [base(0, 700)], 'front');
    // Полуглубины 280: зазор 700 − 560 = 140
    expect(moved!.y).toBeCloseTo(140, 6);
  });
});

describe('сдвиг стрелками', () => {
  it('идёт вдоль собственных осей объекта', () => {
    expect(nudge(base(0, 0), 'right', NUDGE_STEP_MM)).toEqual({ x: 10, y: 0 });
  });

  it('у повёрнутого объекта направление поворачивается вместе с ним', () => {
    const moved = nudge(base(0, 0, 90), 'right', NUDGE_STEP_MM);
    expect(moved.x).toBeCloseTo(0, 6);
    expect(moved.y).toBeCloseTo(-10, 6);
  });

  it('назад — это минус по своей оси', () => {
    expect(nudge(base(100, 0), 'left', NUDGE_STEP_MM)).toEqual({ x: 90, y: 0 });
  });
});
