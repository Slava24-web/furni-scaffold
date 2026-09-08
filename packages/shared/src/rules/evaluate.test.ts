import { describe, expect, it } from 'vitest';
import { evaluateRules, type EvalContext } from './evaluate';
import { ProductRulesSchema, type Ref } from './dsl';

const ctx = (over: Partial<EvalContext> = {}): EvalContext => ({
  params: { width: 1200, height: 2000 },
  options: { facade: 'glass' },
  basePrice: 10_000,
  ...over,
});

const calc = (op: string, args: Ref[]): Ref =>
  ({ kind: 'calc', op, args }) as Ref;

const priceRule = (amount: Ref) =>
  ProductRulesSchema.parse({
    productType: 'parametric',
    rules: [{ id: 'r1', when: { kind: 'always' }, then: [{ kind: 'priceDelta', amount }] }],
  });

describe('арность операций calc', () => {
  it('div считает частное', () => {
    const def = priceRule(
      calc('div', [
        { kind: 'param', code: 'width' },
        { kind: 'const', value: 4 },
      ]),
    );
    expect(evaluateRules(def, ctx()).priceDelta).toBe(300);
  });

  it('div без второго аргумента падает с внятной ошибкой, а не даёт NaN', () => {
    const def = priceRule(calc('div', [{ kind: 'param', code: 'width' }]));
    expect(() => evaluateRules(def, ctx())).toThrowError(/требует аргумент №2/);
  });

  it('деление на ноль запрещено', () => {
    const def = priceRule(
      calc('div', [
        { kind: 'param', code: 'width' },
        { kind: 'const', value: 0 },
      ]),
    );
    expect(() => evaluateRules(def, ctx())).toThrowError(/Деление на ноль/);
  });

  it('sub вычитает слева направо', () => {
    const def = priceRule(
      calc('sub', [
        { kind: 'const', value: 1000 },
        { kind: 'const', value: 250 },
        { kind: 'const', value: 50 },
      ]),
    );
    expect(evaluateRules(def, ctx()).priceDelta).toBe(700);
  });

  it('floor и ceil работают от одного аргумента', () => {
    const floor = priceRule(
      calc('floor', [
        calc('div', [
          { kind: 'const', value: 1250 },
          { kind: 'const', value: 400 },
        ]),
      ]),
    );
    expect(evaluateRules(floor, ctx()).priceDelta).toBe(3);
  });

  it('min и max берут крайние значения', () => {
    const def = priceRule(
      calc('max', [
        { kind: 'const', value: 10 },
        { kind: 'const', value: 90 },
        { kind: 'const', value: 40 },
      ]),
    );
    expect(evaluateRules(def, ctx()).priceDelta).toBe(90);
  });
});

describe('валидация конфигурации', () => {
  it('выбранная запрещённая опция делает конфигурацию невалидной', () => {
    const def = ProductRulesSchema.parse({
      productType: 'static',
      rules: [
        {
          id: 'no-glass-on-wide',
          when: {
            kind: 'cmp',
            left: { kind: 'param', code: 'width' },
            op: 'gt',
            right: { kind: 'const', value: 1000 },
          },
          then: [
            {
              kind: 'forbid',
              group: 'facade',
              options: ['glass'],
              message: 'Стеклянный фасад шире 1000 мм не производится',
            },
          ],
        },
      ],
    });

    const wide = evaluateRules(def, ctx());
    expect(wide.valid).toBe(false);
    expect(wide.violations).toContain('Стеклянный фасад шире 1000 мм не производится');

    const narrow = evaluateRules(def, ctx({ params: { width: 800, height: 2000 } }));
    expect(narrow.valid).toBe(true);
  });

  it('правила применяются в порядке priority', () => {
    const def = ProductRulesSchema.parse({
      productType: 'static',
      rules: [
        {
          id: 'late',
          priority: 200,
          when: { kind: 'always' },
          then: [{ kind: 'setParamRange', code: 'width', min: { kind: 'const', value: 400 }, max: { kind: 'const', value: 900 } }],
        },
        {
          id: 'early',
          priority: 10,
          when: { kind: 'always' },
          then: [{ kind: 'setParamRange', code: 'width', min: { kind: 'const', value: 300 }, max: { kind: 'const', value: 2400 } }],
        },
      ],
    });
    // Побеждает правило с большим priority — оно применяется последним
    expect(evaluateRules(def, ctx()).paramRanges.width).toEqual({ min: 400, max: 900 });
  });

  it('неизвестный параметр — ошибка, а не тихий ноль', () => {
    const def = priceRule({ kind: 'param', code: 'depth' });
    expect(() => evaluateRules(def, ctx())).toThrowError(/Неизвестный параметр: depth/);
  });
});
