import { describe, expect, it } from 'vitest';
import { SERVICE_KINDS, nearestServiceMm, serviceInfo, snapToWall } from './services';
import { createRectangularRoom } from './walls';
import { randomUUID } from './uuid';
import type { ServicePoint } from './schema';

const room = () => createRectangularRoom({ widthMm: 4000, depthMm: 3200 });

const point = (x: number, y: number, kind: ServicePoint['kind'] = 'socket'): ServicePoint => ({
  id: randomUUID(),
  kind,
  position: { x, y },
  heightMm: 1150,
  wallId: null,
  note: '',
});

describe('виды инженерии', () => {
  it('покрывают всё, что нужно кухне', () => {
    const kinds = SERVICE_KINDS.map((item) => item.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(['socket', 'water', 'drain', 'vent', 'gas']),
    );
  });

  it('у каждого вида своя высота и цвет', () => {
    for (const info of SERVICE_KINDS) {
      expect(info.heightMm).toBeGreaterThan(0);
      expect(info.colour).toMatch(/^#/);
    }
  });

  it('розетка над столешницей, а не у пола', () => {
    expect(serviceInfo('socket').heightMm).toBeGreaterThan(1000);
  });

  it('вентканал под потолком', () => {
    expect(serviceInfo('vent').heightMm).toBeGreaterThan(1800);
  });
});

describe('привязка к стене', () => {
  it('точка у стены садится на её поверхность', () => {
    const value = room();
    const snapped = snapToWall(value, { x: 0, y: -1500 });

    expect(snapped.wallId).not.toBeNull();
    // Осевая линия нижней стены проходит по z = −1650
    expect(snapped.position.y).toBeCloseTo(-1650, 0);
  });

  it('точка посреди комнаты к стене не липнет', () => {
    // Розетка в полу бывает, но её ставят отдельно
    expect(snapToWall(room(), { x: 0, y: 0 }).wallId).toBeNull();
  });

  it('в помещении без стен привязки нет', () => {
    expect(snapToWall({ ...room(), walls: [] }, { x: 0, y: 0 }).wallId).toBeNull();
  });
});

describe('ближайшая точка', () => {
  it('без точек нужного вида ответа нет', () => {
    expect(nearestServiceMm([point(0, 0, 'socket')], 'water', { x: 0, y: 0 })).toBeNull();
  });

  it('берётся ближайшая из нескольких', () => {
    const services = [point(3000, 0), point(500, 0)];
    expect(nearestServiceMm(services, 'socket', { x: 0, y: 0 })).toBe(500);
  });
});
