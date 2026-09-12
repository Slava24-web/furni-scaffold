import { describe, expect, it } from 'vitest';
import { EDGE_WASTE, edgeBanding, hardwareList } from './hardware';
import type { CutPart } from './plan';
import type { CatalogProduct, PanelSpec } from '../catalog/schema';
import type { Placement } from '../scene/schema';

const part = (over: Partial<CutPart> = {}): CutPart => ({
  name: 'Боковина',
  kind: 'side',
  material: 'white',
  widthMm: 560,
  heightMm: 720,
  thicknessMm: 18,
  grain: false,
  edgeLengthMm: 720,
  edgeThicknessMm: 2,
  sku: 'SKU',
  productName: 'Шкаф',
  ...over,
});

const panel = (over: Partial<PanelSpec> = {}): PanelSpec => ({
  name: 'Фасад',
  kind: 'facade',
  material: 'oak',
  widthMm: 596,
  heightMm: 716,
  thicknessMm: 18,
  grain: true,
  edgeLengthMm: 2624,
  edgeThicknessMm: 2,
  ...over,
});

const product = (over: Partial<CatalogProduct> = {}): CatalogProduct =>
  ({ sku: 'SKU', name: 'Шкаф', panels: [], drawerCount: 0, ...over }) as CatalogProduct;

const placement = (sku = 'SKU'): Placement =>
  ({ instanceId: `${sku}-${Math.random()}`, sku }) as Placement;

describe('кромка', () => {
  it('без кромкуемых деталей список пуст', () => {
    expect(edgeBanding([part({ edgeLengthMm: 0, edgeThicknessMm: 0 })])).toEqual([]);
  });

  it('считается в погонных метрах с запасом на обрезку', () => {
    const [line] = edgeBanding([part({ edgeLengthMm: 1000 })]);
    expect(line?.metres).toBeCloseTo(Math.ceil(EDGE_WASTE * 10) / 10, 5);
  });

  it('толщины не смешиваются: это разный материал и разная цена', () => {
    const lines = edgeBanding([
      part({ edgeThicknessMm: 2, edgeLengthMm: 1000 }),
      part({ edgeThicknessMm: 0.4, edgeLengthMm: 2000 }),
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0]?.thicknessMm).toBe(2);
  });

  it('одинаковые толщины складываются', () => {
    const lines = edgeBanding([part({ edgeLengthMm: 1000 }), part({ edgeLengthMm: 1000 })]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.metres).toBeGreaterThan(2);
  });
});

describe('фурнитура', () => {
  const catalog = (over: Partial<CatalogProduct>) => new Map([['SKU', product(over)]]);

  it('пустая сцена фурнитуры не требует', () => {
    expect(hardwareList([], catalog({}))).toEqual([]);
  });

  it('на распашной фасад идут петли и ручка', () => {
    const lines = hardwareList([placement()], catalog({ panels: [panel()] }));
    const byName = new Map(lines.map((line) => [line.name, line.quantity]));

    expect(byName.get('Петли накладные')).toBe(2);
    expect(byName.get('Ручки')).toBe(1);
  });

  it('высокому фасаду петель нужно больше', () => {
    const lines = hardwareList(
      [placement()],
      catalog({ panels: [panel({ heightMm: 1900 })] }),
    );
    expect(lines.find((line) => line.name === 'Петли накладные')?.quantity).toBe(4);
  });

  it('фронт ящика на петлях не висит', () => {
    // Три фасада, все три — фронты ящиков
    const lines = hardwareList(
      [placement()],
      catalog({ panels: [panel(), panel(), panel()], drawerCount: 3 }),
    );
    const byName = new Map(lines.map((line) => [line.name, line.quantity]));

    expect(byName.get('Петли накладные')).toBeUndefined();
    expect(byName.get('Направляющие для ящиков')).toBe(3);
    expect(byName.get('Ручки')).toBe(3);
  });

  it('на полку идут четыре полкодержателя', () => {
    const lines = hardwareList(
      [placement()],
      catalog({ panels: [panel({ kind: 'shelf' }), panel({ kind: 'shelf' })] }),
    );
    expect(lines.find((line) => line.name === 'Полкодержатели')?.quantity).toBe(8);
  });

  it('считается на каждое размещение отдельно', () => {
    const lines = hardwareList([placement(), placement()], catalog({ panels: [panel()] }));
    expect(lines.find((line) => line.name === 'Ручки')?.quantity).toBe(2);
  });

  it('товар не из каталога пропускается молча', () => {
    expect(hardwareList([placement('НЕТ')], catalog({ panels: [panel()] }))).toEqual([]);
  });
});
