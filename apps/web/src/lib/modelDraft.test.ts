import { describe, expect, it } from 'vitest';
import { blankDraft, productFromDraft, skuFrom } from './modelDraft';

const facts = { widthMm: 800, heightMm: 820, depthMm: 560, materials: ['oak', 'white'] };

describe('артикул из названия', () => {
  it('кириллица переводится в латиницу', () => {
    // Артикул попадает в имена файлов и URL моделей: кириллица там
    // превращается в проценты
    expect(skuFrom('Кухня: нижний шкаф 800')).toBe('KUHNYA-NIZHNIY-SHKAF-800');
  });

  it('разделители схлопываются, края обрезаются', () => {
    expect(skuFrom('  Шкаф   «Орион» 1200!  ')).toBe('SHKAF-ORION-1200');
  });

  it('латиница проходит как есть', () => {
    expect(skuFrom('Base cabinet 600')).toBe('BASE-CABINET-600');
  });

  it('длинное название обрезается', () => {
    expect(skuFrom('a'.repeat(80)).length).toBe(40);
  });
});

describe('карточка каталога', () => {
  it('габарит берётся из модели, а не из формы', () => {
    const draft = { ...blankDraft(), name: 'Тумба', widthMm: 1, heightMm: 1, depthMm: 1 };
    const product = productFromDraft(draft, facts);

    expect(product.widthMm).toBe(800);
    expect(product.heightMm).toBe(820);
    expect(product.depthMm).toBe(560);
  });

  it('цена переводится в копейки', () => {
    const draft = { ...blankDraft(), name: 'Тумба', priceRubles: 10900 };
    expect(productFromDraft(draft, facts).basePriceCents).toBe(1090000);
  });

  it('пустой артикул подставляется из названия', () => {
    const draft = { ...blankDraft(), name: 'Стол Норд 1400' };
    expect(productFromDraft(draft, facts).sku).toBe('STOL-NORD-1400');
  });

  it('заданный вручную артикул не перетирается', () => {
    const draft = { ...blankDraft(), name: 'Стол', sku: 'ACME-TBL-1' };
    expect(productFromDraft(draft, facts).sku).toBe('ACME-TBL-1');
  });

  it('материалы берутся из модели: по ним подключается отделка', () => {
    const product = productFromDraft({ ...blankDraft(), name: 'Тумба' }, facts);
    expect(product.materials).toEqual(['oak', 'white']);
  });

  it('без категории карточка всё равно собирается', () => {
    expect(productFromDraft({ ...blankDraft(), name: 'Тумба' }, facts).category).toBe(
      'Без категории',
    );
  });
});
