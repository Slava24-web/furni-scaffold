import { describe, expect, it } from 'vitest';
import { boundsMm, mergeGeometries } from './geometry.mjs';
import { LEG_HEIGHT, taperedLegs } from './legs.mjs';

const merged = (parts) => boundsMm(mergeGeometries(parts));

describe('ножки корпусной мебели', () => {
  it('их четыре — по одной на угол', () => {
    expect(taperedLegs(1200, 450)).toHaveLength(4);
  });

  it('стоят на полу', () => {
    expect(merged(taperedLegs(1200, 450)).minYMm).toBeCloseTo(0, 3);
  });

  it('поднимают корпус на свою высоту', () => {
    expect(merged(taperedLegs(1200, 450, { heightMm: 80 })).heightMm).toBeCloseTo(80, 3);
    expect(merged(taperedLegs(1200, 450)).heightMm).toBeCloseTo(LEG_HEIGHT, 3);
  });

  it('не выходят за габарит изделия', () => {
    const bounds = merged(taperedLegs(1200, 450));
    expect(bounds.widthMm).toBeLessThanOrEqual(1200);
    expect(bounds.depthMm).toBeLessThanOrEqual(450);
  });

  it('у узкого изделия отступ ужимается, но ножки остаются внутри габарита', () => {
    // Отступ по умолчанию больше половины ширины: без ограничения
    // ножки вылезли бы наружу и изделие заняло бы больше места
    const bounds = merged(taperedLegs(120, 120, { insetMm: 70 }));
    expect(bounds.widthMm).toBeLessThanOrEqual(120);
    expect(bounds.depthMm).toBeLessThanOrEqual(120);
  });

  it('ножка сужается книзу', () => {
    const [leg] = taperedLegs(1200, 450, { topRadiusMm: 26, bottomRadiusMm: 16 });
    expect(diameterAt(leg, 'bottom')).toBeLessThan(diameterAt(leg, 'top'));
  });
});

/**
 * Диаметр детали на её нижнем или верхнем срезе.
 * Берётся размах по X: ножка сдвинута в угол, и расстояние от начала
 * координат её радиусом не является.
 */
function diameterAt(geometry, level) {
  const ys = [];
  for (let i = 1; i < geometry.positions.length; i += 3) ys.push(geometry.positions[i]);
  const target = level === 'bottom' ? Math.min(...ys) : Math.max(...ys);

  const xs = [];
  for (let i = 0; i < geometry.positions.length; i += 3) {
    if (Math.abs(geometry.positions[i + 1] - target) > 1e-6) continue;
    xs.push(geometry.positions[i]);
  }
  return Math.max(...xs) - Math.min(...xs);
}
