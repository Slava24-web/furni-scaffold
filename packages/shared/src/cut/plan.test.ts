import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CUT,
  KERF_MM,
  SHEET_HEIGHT_MM,
  SHEET_WIDTH_MM,
  TRIM_MM,
  packParts,
  planCut,
  sceneParts,
  type CutPart,
} from './plan';
import type { CatalogProduct } from '../catalog/schema';
import type { Placement } from '../scene/schema';

const part = (over: Partial<CutPart> = {}): CutPart => ({
  name: 'Боковина',
  material: 'white',
  widthMm: 560,
  heightMm: 720,
  thicknessMm: 18,
  grain: false,
  sku: 'TEST-KIT-BASE-600',
  productName: 'Нижний шкаф 600',
  ...over,
});

const usableWidth = SHEET_WIDTH_MM - TRIM_MM * 2;
const usableHeight = SHEET_HEIGHT_MM - TRIM_MM * 2;

/** Пересекаются ли две уложенные детали. */
function overlaps(
  a: { xMm: number; yMm: number; widthMm: number; heightMm: number },
  b: { xMm: number; yMm: number; widthMm: number; heightMm: number },
): boolean {
  return (
    a.xMm < b.xMm + b.widthMm &&
    b.xMm < a.xMm + a.widthMm &&
    a.yMm < b.yMm + b.heightMm &&
    b.yMm < a.yMm + a.heightMm
  );
}

describe('карта раскроя', () => {
  it('пустая сцена даёт пустую карту', () => {
    const plan = packParts([]);
    expect(plan.sheets).toEqual([]);
    expect(plan.totalParts).toBe(0);
    expect(plan.usage).toBe(0);
  });

  it('все детали попадают на листы', () => {
    const parts = Array.from({ length: 24 }, () => part());
    const plan = packParts(parts);
    const placed = plan.sheets.reduce((sum, sheet) => sum + sheet.parts.length, 0);

    expect(placed).toBe(parts.length);
    expect(plan.oversized).toEqual([]);
  });

  it('детали не налезают друг на друга', () => {
    const parts = [
      ...Array.from({ length: 10 }, () => part()),
      ...Array.from({ length: 6 }, () => part({ name: 'Полка', widthMm: 564, heightMm: 530 })),
    ];

    for (const sheet of packParts(parts).sheets) {
      for (let i = 0; i < sheet.parts.length; i++) {
        for (let j = i + 1; j < sheet.parts.length; j++) {
          expect(overlaps(sheet.parts[i]!, sheet.parts[j]!)).toBe(false);
        }
      }
    }
  });

  it('детали не выходят за рабочее поле листа', () => {
    const parts = Array.from({ length: 30 }, (_, i) =>
      part({ widthMm: 300 + i * 30, heightMm: 400 + i * 20 }),
    );

    for (const sheet of packParts(parts).sheets) {
      for (const placed of sheet.parts) {
        expect(placed.xMm + placed.widthMm).toBeLessThanOrEqual(usableWidth);
        expect(placed.yMm + placed.heightMm).toBeLessThanOrEqual(usableHeight);
      }
    }
  });

  it('между деталями в полосе остаётся пропил', () => {
    const parts = [part({ widthMm: 600, heightMm: 700 }), part({ widthMm: 600, heightMm: 700 })];
    const [sheet] = packParts(parts).sheets;
    const [first, second] = sheet!.parts;

    expect(second!.xMm - (first!.xMm + first!.widthMm)).toBe(KERF_MM);
  });

  it('материал и толщина не смешиваются на одном листе', () => {
    const plan = packParts([
      part(),
      part({ material: 'oak', grain: true }),
      part({ name: 'Задняя стенка', thicknessMm: 6 }),
    ]);

    expect(plan.sheets).toHaveLength(3);
    for (const sheet of plan.sheets) {
      const kinds = new Set(sheet.parts.map((p) => `${p.part.material}|${p.part.thicknessMm}`));
      expect(kinds.size).toBe(1);
    }
  });

  it('листы одной группы нумеруются подряд', () => {
    // Деталей заведомо больше, чем влезает на один лист
    const parts = Array.from({ length: 40 }, () => part({ widthMm: 900, heightMm: 900 }));
    const indices = packParts(parts).sheets.map((sheet) => sheet.index);

    expect(indices).toEqual(indices.map((_, i) => i + 1));
  });

  it('деталь с рисунком не поворачивают', () => {
    // Волокно фасада обязано идти в одну сторону со всеми остальными
    const facade = part({ name: 'Фасад', material: 'oak', widthMm: 400, heightMm: 700, grain: true });
    const [sheet] = packParts([facade]).sheets;

    expect(sheet!.parts[0]?.rotated).toBe(false);
    expect(sheet!.parts[0]?.widthMm).toBe(400);
  });

  it('деталь без рисунка кладётся длинной стороной вдоль листа', () => {
    const [sheet] = packParts([part({ widthMm: 400, heightMm: 900 })]).sheets;

    expect(sheet!.parts[0]?.rotated).toBe(true);
    expect(sheet!.parts[0]?.widthMm).toBe(900);
  });

  it('деталь длиннее листа уходит в отдельный список, а не теряется', () => {
    const huge = part({ widthMm: 4000, heightMm: 3000 });
    const plan = packParts([huge, part()]);

    expect(plan.oversized).toHaveLength(1);
    expect(plan.totalParts).toBe(1);
  });

  it('деталь с рисунком длиннее листа по высоте не спасается поворотом', () => {
    const tall = part({ material: 'oak', grain: true, widthMm: 600, heightMm: 2500 });
    expect(packParts([tall]).oversized).toHaveLength(1);
  });

  it('загрузка листа считается по площади деталей', () => {
    const single = part({ widthMm: 1000, heightMm: 1000 });
    const [sheet] = packParts([single]).sheets;

    expect(sheet!.usage).toBeCloseTo((1000 * 1000) / (usableWidth * usableHeight), 6);
  });

  it('пропил и обрезка кромки задаются снаружи', () => {
    const parts = [part({ widthMm: 1000, heightMm: 1000 }), part({ widthMm: 1000, heightMm: 1000 })];
    const wide = packParts(parts, { ...DEFAULT_CUT, kerfMm: 100 });
    const [first, second] = wide.sheets[0]!.parts;

    expect(second!.xMm - (first!.xMm + first!.widthMm)).toBe(100);
  });
});

describe('детали сцены', () => {
  const product = (over: Partial<CatalogProduct> = {}): CatalogProduct =>
    ({
      sku: 'TEST-KIT-BASE-600',
      name: 'Нижний шкаф 600',
      panels: [
        { name: 'Боковина', material: 'white', widthMm: 560, heightMm: 720, thicknessMm: 18, grain: false },
      ],
      ...over,
    }) as CatalogProduct;

  const placement = (sku: string): Placement =>
    ({ instanceId: sku, sku, position: { x: 0, y: 0, z: 0 }, rotationY: 0 }) as Placement;

  it('деталь считается на каждое размещение отдельно', () => {
    const products = new Map([['TEST-KIT-BASE-600', product()]]);
    const parts = sceneParts([placement('TEST-KIT-BASE-600'), placement('TEST-KIT-BASE-600')], products);

    expect(parts).toHaveLength(2);
  });

  it('товар без листовых деталей пропускается: технику не пилят', () => {
    const products = new Map([['TEST-APP-FRIDGE-600', product({ sku: 'TEST-APP-FRIDGE-600', panels: [] })]]);
    expect(sceneParts([placement('TEST-APP-FRIDGE-600')], products)).toEqual([]);
  });

  it('товар не из каталога пропускается молча', () => {
    expect(sceneParts([placement('НЕТ-ТАКОГО')], new Map())).toEqual([]);
  });

  it('карта считается прямо по сцене', () => {
    const products = new Map([['TEST-KIT-BASE-600', product()]]);
    const plan = planCut([placement('TEST-KIT-BASE-600')], products);

    expect(plan.totalParts).toBe(1);
    expect(plan.sheets[0]?.parts[0]?.part.productName).toBe('Нижний шкаф 600');
  });
});
