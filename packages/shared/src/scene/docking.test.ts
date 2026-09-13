import { describe, expect, it } from 'vitest';
import type { Box } from './box';
import { dockCandidates, groupIntoChains, overlayCandidates } from './docking';
import { boxesOverlap } from './overlap';

/** Нижний кухонный модуль 600×820×600, стоящий на полу. */
const cabinet = (over: Partial<Box> = {}): Box => ({
  centre: { x: 0, y: 0 },
  halfWidthMm: 300,
  halfDepthMm: 300,
  rotationDeg: 0,
  bottomMm: 0,
  topMm: 820,
  ...over,
});

describe('точки стыковки', () => {
  it('даёт четыре стороны', () => {
    const sides = dockCandidates(cabinet(), 300, 300).map((c) => c.side);
    expect(sides.sort()).toEqual(['back', 'front', 'left', 'right']);
  });

  it('сосед встаёт грань в грань', () => {
    const [rightSide] = dockCandidates(cabinet(), 400, 300);
    // 300 своей половины плюс 400 половины соседа
    expect(rightSide?.position).toEqual({ x: 700, y: 0 });
  });

  it('состыкованные объекты не пересекаются', () => {
    const target = cabinet();
    for (const candidate of dockCandidates(target, 400, 250)) {
      const moved = cabinet({
        centre: candidate.position,
        halfWidthMm: 400,
        halfDepthMm: 250,
        rotationDeg: candidate.rotationDeg,
      });
      expect(boxesOverlap(target, moved)).toBe(false);
    }
  });

  it('разворот наследуется от соседа: ряд смотрит в одну сторону', () => {
    const rotated = cabinet({ rotationDeg: 90 });
    for (const candidate of dockCandidates(rotated, 300, 300)) {
      expect(candidate.rotationDeg).toBe(90);
    }
  });

  it('у повёрнутого соседа стыковка идёт вдоль его осей', () => {
    const rotated = cabinet({ rotationDeg: 90 });
    const right = dockCandidates(rotated, 300, 300).find((c) => c.side === 'right');
    // Локальная +X при повороте на 90° смотрит в −Z плана
    expect(right?.position.x).toBeCloseTo(0, 6);
    expect(right?.position.y).toBeCloseTo(-600, 6);
  });
});

describe('выравнивание поверх', () => {
  /** Нижний модуль 800 мм глубиной 600, стоящий у стены. */
  const base = cabinet({ halfWidthMm: 400, halfDepthMm: 300, bottomMm: 0, topMm: 820 });

  it('совмещает задние грани: столешница и тумба прижаты к одной стене', () => {
    // Столешница глубже тумбы на 40 мм, значит её центр уходит вперёд на 40
    const [leftFlush] = overlayCandidates(base, 1000, 340);
    expect(leftFlush?.position.y).toBeCloseTo(40, 6);
  });

  it('даёт три варианта вдоль ряда', () => {
    const alignments = overlayCandidates(base, 1000, 300).map((c) => c.alignment);
    expect(alignments.sort()).toEqual(['centred', 'leftFlush', 'rightFlush']);
  });

  it('по левому краю совмещает левые грани', () => {
    const left = overlayCandidates(base, 1000, 300).find((c) => c.alignment === 'leftFlush')!;
    // Левая грань тумбы на -400, левая грань столешницы должна встать туда же
    expect(left.position.x - 1000).toBeCloseTo(-400, 6);
  });

  it('по правому краю совмещает правые грани', () => {
    const right = overlayCandidates(base, 1000, 300).find((c) => c.alignment === 'rightFlush')!;
    expect(right.position.x + 1000).toBeCloseTo(400, 6);
  });

  it('по центру оставляет центр цели', () => {
    const centred = overlayCandidates(base, 1000, 300).find((c) => c.alignment === 'centred')!;
    expect(centred.position.x).toBeCloseTo(0, 6);
  });

  it('наследует разворот цели', () => {
    const rotated = cabinet({ rotationDeg: 90, halfWidthMm: 400 });
    for (const candidate of overlayCandidates(rotated, 1000, 300)) {
      expect(candidate.rotationDeg).toBe(90);
    }
  });

  it('у повёрнутой цели выравнивание идёт вдоль её осей', () => {
    const rotated = cabinet({ rotationDeg: 90, halfWidthMm: 400, halfDepthMm: 300 });
    const left = overlayCandidates(rotated, 1000, 300).find((c) => c.alignment === 'leftFlush')!;
    // Локальная +X при повороте на 90° смотрит в −Z плана
    expect(left.position.x).toBeCloseTo(0, 6);
    expect(left.position.y).toBeCloseTo(-600, 6);
  });

  it('выровненная столешница не конфликтует с тумбой', () => {
    const [leftFlush] = overlayCandidates(base, 1000, 300);
    const worktop: Box = {
      centre: leftFlush!.position,
      halfWidthMm: 1000,
      halfDepthMm: 300,
      rotationDeg: leftFlush!.rotationDeg,
      bottomMm: 820,
      topMm: 858,
    };
    expect(boxesOverlap(base, worktop)).toBe(false);
  });
});

describe('цепочки смежных модулей', () => {
  const module = (id: string, x: number, halfWidth = 300) => ({
    id,
    box: cabinet({ centre: { x, y: 0 }, halfWidthMm: halfWidth }),
  });

  it('одиночный модуль это цепочка из одного', () => {
    const chains = groupIntoChains([module('a', 0)]);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.memberIds).toEqual(['a']);
    expect(chains[0]?.box.halfWidthMm).toBe(300);
  });

  it('модули вплотную собираются в один ряд', () => {
    const chains = groupIntoChains([module('a', 0), module('b', 600), module('c', 1200)]);

    expect(chains).toHaveLength(1);
    expect(chains[0]?.memberIds.sort()).toEqual(['a', 'b', 'c']);
    // Ряд из трёх шестисоток это 1800 мм
    expect(chains[0]?.box.halfWidthMm).toBe(900);
    expect(chains[0]?.box.centre.x).toBe(600);
  });

  it('разрыв между модулями делит ряд на две цепочки', () => {
    const chains = groupIntoChains([module('a', 0), module('b', 600), module('c', 2000)]);

    expect(chains).toHaveLength(2);
    expect(chains.map((c) => c.memberIds.length).sort()).toEqual([1, 2]);
  });

  it('модули разной ширины считаются по своим габаритам', () => {
    // 600 и 800 вплотную: центры разнесены на 300 + 400
    const chains = groupIntoChains([module('a', 0), module('b', 700, 400)]);

    expect(chains).toHaveLength(1);
    expect(chains[0]?.box.halfWidthMm).toBe(700);
  });

  it('модули разного разворота в один ряд не собираются', () => {
    const rotated = {
      id: 'b',
      box: cabinet({ centre: { x: 600, y: 0 }, rotationDeg: 90 }),
    };
    expect(groupIntoChains([module('a', 0), rotated])).toHaveLength(2);
  });

  it('модули разной высоты в один ряд не собираются', () => {
    const upper = {
      id: 'b',
      box: cabinet({ centre: { x: 600, y: 0 }, bottomMm: 1450, topMm: 2170 }),
    };
    expect(groupIntoChains([module('a', 0), upper])).toHaveLength(2);
  });

  it('модули со смещением по глубине в один ряд не собираются', () => {
    const offset = { id: 'b', box: cabinet({ centre: { x: 600, y: 400 } }) };
    expect(groupIntoChains([module('a', 0), offset])).toHaveLength(2);
  });

  it('повёрнутый ряд собирается вдоль своей оси', () => {
    const first = { id: 'a', box: cabinet({ centre: { x: 0, y: 0 }, rotationDeg: 90 }) };
    // Локальная +X при повороте на 90° смотрит в −Z плана
    const second = { id: 'b', box: cabinet({ centre: { x: 0, y: -600 }, rotationDeg: 90 }) };
    const chains = groupIntoChains([first, second]);

    expect(chains).toHaveLength(1);
    expect(chains[0]?.box.halfWidthMm).toBe(600);
    expect(chains[0]?.box.centre.y).toBeCloseTo(-300, 6);
  });

  it('пустой список даёт пустой результат', () => {
    expect(groupIntoChains([])).toEqual([]);
  });

  it('порядок во входных данных не влияет на состав цепочки', () => {
    const shuffled = groupIntoChains([module('c', 1200), module('a', 0), module('b', 600)]);
    expect(shuffled).toHaveLength(1);
    expect(shuffled[0]?.box.halfWidthMm).toBe(900);
  });

  it('края цепочки годятся для выравнивания столешницы над рядом', () => {
    const chains = groupIntoChains([module('a', 0), module('b', 600), module('c', 1200)]);
    const [leftFlush] = overlayCandidates(chains[0]!.box, 900, 300);

    // Левый край столешницы 1800 совпадает с левым краем ряда
    expect(leftFlush!.position.x - 900).toBeCloseTo(-300, 6);
  });
});
