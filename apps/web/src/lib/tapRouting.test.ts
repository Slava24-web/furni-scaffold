import { describe, expect, it } from 'vitest';
import { Object3D, Vector2 } from 'three';
import { routeTap, type TapProbe } from './tapRouting';

const nothing: TapProbe = {
  pickService: () => null,
  pickDimension: () => null,
  pickOpening: () => null,
  pick: () => null,
  pickDrawer: () => null,
  pickDoor: () => null,
};

const probe = (over: Partial<TapProbe>): TapProbe => ({ ...nothing, ...over });
const ndc = new Vector2(0, 0);
const select = { planning: false, selectedId: null };

describe('routeTap', () => {
  it('пустой тап снимает выделение', () => {
    expect(routeTap(nothing, ndc, select)).toEqual({ kind: 'select', instanceId: null });
  });

  it('выделяет объект под указателем', () => {
    const root = new Object3D();
    const action = routeTap(probe({ pick: () => ({ instanceId: 'a', root }) }), ndc, select);
    expect(action).toEqual({ kind: 'select', instanceId: 'a' });
  });

  it('метка инженерии перебивает всё остальное', () => {
    const root = new Object3D();
    const action = routeTap(
      probe({
        pickService: () => 's1',
        pickDimension: () => ({ id: 'd', lengthMm: 100 }),
        pickOpening: () => 'o1',
        pick: () => ({ instanceId: 'a', root }),
      }),
      ndc,
      select,
    );
    expect(action).toEqual({ kind: 'service', serviceId: 's1' });
  });

  it('в режиме планировки тап адресован полу, а не мебели', () => {
    const root = new Object3D();
    const action = routeTap(probe({ pick: () => ({ instanceId: 'a', root }) }), ndc, {
      planning: true,
      selectedId: 'a',
    });
    expect(action).toEqual({ kind: 'floor' });
  });

  it('подпись размера нажимается сквозь мебель под ней', () => {
    const root = new Object3D();
    const action = routeTap(
      probe({
        pickDimension: () => ({ id: 'd', lengthMm: 3000 }),
        pick: () => ({ instanceId: 'a', root }),
      }),
      ndc,
      select,
    );
    expect(action).toEqual({ kind: 'dimension', dimension: { id: 'd', lengthMm: 3000 } });
  });

  it('дверь выбирается раньше мебели, стоящей у стены', () => {
    const root = new Object3D();
    const action = routeTap(
      probe({ pickOpening: () => 'o1', pick: () => ({ instanceId: 'a', root }) }),
      ndc,
      select,
    );
    expect(action).toEqual({ kind: 'opening', openingId: 'o1' });
  });

  it('ящик выдвигается только у уже выделенного изделия', () => {
    const root = new Object3D();
    const drawer = new Object3D();
    const withDrawer = probe({
      pick: () => ({ instanceId: 'a', root }),
      pickDrawer: () => drawer,
    });

    // Первый тап только выбирает: пользователь ещё не показал,
    // что хочет заглянуть внутрь
    expect(routeTap(withDrawer, ndc, { planning: false, selectedId: null })).toEqual({
      kind: 'select',
      instanceId: 'a',
    });
    expect(routeTap(withDrawer, ndc, { planning: false, selectedId: 'a' })).toEqual({
      kind: 'drawer',
      node: drawer,
    });
  });

  it('дверца открывается, когда ящика в этой точке нет', () => {
    const root = new Object3D();
    const door = new Object3D();
    const action = routeTap(
      probe({ pick: () => ({ instanceId: 'a', root }), pickDoor: () => door }),
      ndc,
      { planning: false, selectedId: 'a' },
    );
    expect(action).toEqual({ kind: 'door', node: door });
  });
});
