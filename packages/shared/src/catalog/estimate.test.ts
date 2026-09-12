import { describe, expect, it } from 'vitest';
import { estimateScene, finishDeltaCents, placementPriceCents, selectedFinish } from './estimate';
import type { CatalogMaterial, CatalogProduct } from './schema';
import type { Placement } from '../scene/schema';

const material = (code: string, priceModifierCents: number): CatalogMaterial => ({
  code,
  name: `Материал ${code}`,
  priceModifierCents,
  baseColorFactor: [1, 1, 1, 1],
  roughness: 0.5,
  metallic: 0,
});

const materials = new Map<string, CatalogMaterial>([
  ['oak', material('oak', 0)],
  ['white', material('white', -180000)],
  ['graphite', material('graphite', 150000)],
]);

const facadeSlot = {
  code: 'facade',
  label: 'Фасад',
  slotMaterial: 'oak',
  options: ['oak', 'white', 'graphite'],
};

const product = (over: Partial<CatalogProduct> = {}): CatalogProduct => ({
  sku: 'TEST-KIT-BASE-600',
  name: 'Нижний шкаф 600',
  category: 'Кухня',
  type: 'static',
  basePriceCents: 890000,
  widthMm: 600,
  heightMm: 820,
  depthMm: 618,
  mountHeightMm: 0,
  snapToWall: true,
  stackable: false,
  materials: ['oak'],
  drawerCount: 0,
  drawerTravelMm: 0,
  urlTemplate: '/x/lod{lod}.glb',
  lods: [{ lod: 0, bytes: 1, triangles: 1 }],
  finishes: [facadeSlot],
  ...over,
});

const placement = (sku: string, options: Placement['options'] = {}): Placement => ({
  instanceId: `${sku}-${Math.random()}`,
  productId: '11111111-1111-4111-8111-111111111111',
  sku,
  position: { x: 0, y: 0, z: 0 },
  rotationY: 0,
  options,
  params: {},
  anchoredToWallId: null,
  locked: false,
});

describe('надбавка за отделку', () => {
  it('исполнение по умолчанию ничего не добавляет', () => {
    expect(finishDeltaCents(product(), {}, materials)).toBe(0);
    expect(finishDeltaCents(product(), { facade: 'oak' }, materials)).toBe(0);
  });

  it('считается разницей с включённым в цену материалом', () => {
    // Базовая цена уже содержит дуб, поэтому графит стоит только разницу
    expect(finishDeltaCents(product(), { facade: 'graphite' }, materials)).toBe(150000);
    expect(finishDeltaCents(product(), { facade: 'white' }, materials)).toBe(-180000);
  });

  it('слот с ненулевым включённым материалом считается от него', () => {
    const worktop = product({
      finishes: [{ code: 'worktop', label: 'Столешница', slotMaterial: 'graphite', options: ['graphite', 'oak'] }],
    });
    // Включён графит за 150000, выбран дуб за 0
    expect(finishDeltaCents(worktop, { worktop: 'oak' }, materials)).toBe(-150000);
  });

  it('выбор вне списка слота игнорируется', () => {
    expect(finishDeltaCents(product(), { facade: 'steel' }, materials)).toBe(0);
  });

  it('выбор для несуществующего слота игнорируется', () => {
    expect(finishDeltaCents(product({ finishes: [] }), { facade: 'graphite' }, materials)).toBe(0);
  });

  it('неизвестный материал не ломает расчёт', () => {
    const odd = product({ finishes: [{ ...facadeSlot, options: ['oak', 'нет-такого'] }] });
    expect(finishDeltaCents(odd, { facade: 'нет-такого' }, materials)).toBe(0);
  });

  it('складывает надбавки нескольких слотов', () => {
    const twoSlots = product({
      finishes: [facadeSlot, { code: 'top', label: 'Крышка', slotMaterial: 'oak', options: ['oak', 'graphite'] }],
    });
    expect(finishDeltaCents(twoSlots, { facade: 'graphite', top: 'graphite' }, materials)).toBe(300000);
  });
});

describe('цена размещения', () => {
  it('база плюс надбавка', () => {
    expect(placementPriceCents(product(), { facade: 'graphite' }, materials)).toBe(1040000);
  });

  it('дешёвая отделка снижает цену', () => {
    expect(placementPriceCents(product(), { facade: 'white' }, materials)).toBe(710000);
  });
});

describe('смета сцены', () => {
  const products = new Map([['TEST-KIT-BASE-600', product()]]);

  it('пустая сцена даёт нулевую смету', () => {
    const estimate = estimateScene([], products, materials);
    expect(estimate.totalCents).toBe(0);
    expect(estimate.lines).toEqual([]);
    expect(estimate.positions).toBe(0);
  });

  it('одинаковые изделия в одной отделке идут одной строкой', () => {
    const estimate = estimateScene(
      [placement('TEST-KIT-BASE-600'), placement('TEST-KIT-BASE-600')],
      products,
      materials,
    );

    expect(estimate.lines).toHaveLength(1);
    expect(estimate.lines[0]?.quantity).toBe(2);
    expect(estimate.totalCents).toBe(1780000);
  });

  it('одинаковые изделия в разной отделке разделяются', () => {
    // Слить их значило бы показать неверную цену за единицу
    const estimate = estimateScene(
      [
        placement('TEST-KIT-BASE-600', { facade: 'oak' }),
        placement('TEST-KIT-BASE-600', { facade: 'graphite' }),
      ],
      products,
      materials,
    );

    expect(estimate.lines).toHaveLength(2);
    expect(estimate.totalCents).toBe(890000 + 1040000);
  });

  it('строки идут от дорогих к дешёвым', () => {
    const cheap = product({ sku: 'CHEAP', basePriceCents: 1000 });
    const estimate = estimateScene(
      [placement('CHEAP'), placement('TEST-KIT-BASE-600')],
      new Map([...products, ['CHEAP', cheap]]),
      materials,
    );

    expect(estimate.lines.map((line) => line.sku)).toEqual(['TEST-KIT-BASE-600', 'CHEAP']);
  });

  it('изделие вне каталога попадает в список неизвестных, а не в цену', () => {
    const estimate = estimateScene([placement('НЕТ-В-КАТАЛОГЕ')], products, materials);

    expect(estimate.totalCents).toBe(0);
    expect(estimate.unknownSkus).toEqual(['НЕТ-В-КАТАЛОГЕ']);
    expect(estimate.positions).toBe(1);
  });

  it('в строке видно выбранную отделку', () => {
    const estimate = estimateScene(
      [placement('TEST-KIT-BASE-600', { facade: 'graphite' })],
      products,
      materials,
    );

    expect(estimate.lines[0]?.finish).toEqual([{ label: 'Фасад', material: 'Материал graphite' }]);
  });
});

describe('выбор отделки слота', () => {
  it('без выбора берётся исполнение модели', () => {
    expect(selectedFinish('facade', facadeSlot, {})).toBe('oak');
  });

  it('выбор из списка принимается', () => {
    expect(selectedFinish('facade', facadeSlot, { facade: 'white' })).toBe('white');
  });

  it('выбор вне списка отбрасывается', () => {
    expect(selectedFinish('facade', facadeSlot, { facade: 'steel' })).toBe('oak');
  });
});
