import { z } from 'zod';

/**
 * DSL правил конфигурации. Декларативный, безопасный: никакого eval.
 * Один и тот же исполнитель работает на клиенте (мгновенный отклик)
 * и на сервере (авторитетный расчёт цены и валидация).
 */

export const CalcOp = z.enum(['add', 'sub', 'mul', 'div', 'floor', 'ceil', 'min', 'max']);

/** Ссылка на значение: параметр, выбранная опция или константа. */
export const RefSchema: z.ZodType<Ref> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('param'), code: z.string() }),
    z.object({ kind: z.literal('option'), group: z.string() }),
    z.object({ kind: z.literal('const'), value: z.union([z.number(), z.string(), z.boolean()]) }),
    z.object({ kind: z.literal('calc'), op: CalcOp, args: z.array(RefSchema).min(1).max(4) }),
  ]),
);


export type Ref =
  | { kind: 'param'; code: string }
  | { kind: 'option'; group: string }
  | { kind: 'const'; value: number | string | boolean }
  | { kind: 'calc'; op: z.infer<typeof CalcOp>; args: Ref[] };

export const ComparatorSchema = z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn']);

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('cmp'), left: RefSchema, op: ComparatorSchema, right: RefSchema }),
    z.object({ kind: z.literal('and'), of: z.array(ConditionSchema).min(1).max(8) }),
    z.object({ kind: z.literal('or'), of: z.array(ConditionSchema).min(1).max(8) }),
    z.object({ kind: z.literal('not'), of: ConditionSchema }),
    z.object({ kind: z.literal('always') }),
  ]),
);

export type Condition =
  | { kind: 'cmp'; left: Ref; op: z.infer<typeof ComparatorSchema>; right: Ref }
  | { kind: 'and'; of: Condition[] }
  | { kind: 'or'; of: Condition[] }
  | { kind: 'not'; of: Condition }
  | { kind: 'always' };

/** Эффекты правила. forbid/require формируют пользовательские сообщения. */
export const EffectSchema = z.union([
  z.object({
    kind: z.literal('forbid'),
    group: z.string(),
    options: z.array(z.string()),
    message: z.string().max(300),
  }),
  z.object({
    kind: z.literal('require'),
    group: z.string(),
    option: z.string(),
    message: z.string().max(300),
  }),
  z.object({ kind: z.literal('addPart'), part: z.string(), count: RefSchema.optional() }),
  z.object({ kind: z.literal('priceDelta'), amount: RefSchema }),
  z.object({ kind: z.literal('setParamRange'), code: z.string(), min: RefSchema, max: RefSchema }),
]);

export const RuleSchema = z.object({
  id: z.string(),
  when: ConditionSchema,
  then: z.array(EffectSchema).min(1).max(8),
  /** Порядок применения. Правила с меньшим priority применяются раньше. */
  priority: z.number().int().default(100),
});

export const ParamDefSchema = z.object({
  code: z.string(),
  label: z.string(),
  min: z.number().int(),
  max: z.number().int(),
  step: z.number().int().default(1),
  default: z.number().int(),
});

/** Описание сборки параметрического изделия. */
export const AssemblyStepSchema = z.object({
  part: z.string(),
  count: RefSchema,
  distribute: z.enum(['none', 'horizontal', 'vertical', 'edges']).default('none'),
  materialSlot: z.string().optional(),
  constraint: ConditionSchema.optional(),
});

export const ProductRulesSchema = z.object({
  productType: z.enum(['static', 'parametric']),
  params: z.array(ParamDefSchema).max(12).default([]),
  assembly: z.array(AssemblyStepSchema).max(32).default([]),
  rules: z.array(RuleSchema).max(64).default([]),
});

export type ProductRules = z.infer<typeof ProductRulesSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Effect = z.infer<typeof EffectSchema>;
export type ParamDef = z.infer<typeof ParamDefSchema>;
