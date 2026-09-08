import type { Condition, Effect, ProductRules, Ref } from './dsl';

export interface EvalContext {
  params: Record<string, number>;
  options: Record<string, string>;
  basePrice: number;
}

export interface EvalResult {
  /** Запрещённые опции: группа -> набор кодов, с причиной */
  forbidden: Record<string, { options: string[]; message: string }[]>;
  required: { group: string; option: string; message: string }[];
  addedParts: { part: string; count: number }[];
  priceDelta: number;
  paramRanges: Record<string, { min: number; max: number }>;
  /** Конфигурация валидна, если нет нарушенных require и выбранных forbidden */
  valid: boolean;
  violations: string[];
}

type Primitive = number | string | boolean;

function resolve(ref: Ref, ctx: EvalContext): Primitive {
  switch (ref.kind) {
    case 'const':
      return ref.value;
    case 'param': {
      const v = ctx.params[ref.code];
      if (v === undefined) throw new Error(`Неизвестный параметр: ${ref.code}`);
      return v;
    }
    case 'option': {
      const v = ctx.options[ref.group];
      return v ?? '';
    }
    case 'calc': {
      const args = ref.args.map((a) => Number(resolve(a, ctx)));
      // Схема гарантирует 1..4 аргумента, но арность зависит от операции:
      // div требует два, floor/ceil — один. Проверяем явно, иначе правило
      // с неверной арностью молча вернёт NaN и уедет в цену.
      const at = (i: number): number => {
        const v = args[i];
        if (v === undefined) {
          throw new Error(`Операция ${ref.op} требует аргумент №${i + 1}`);
        }
        return v;
      };
      switch (ref.op) {
        case 'add': return args.reduce((a, b) => a + b, 0);
        case 'sub': return args.slice(1).reduce((a, b) => a - b, at(0));
        case 'mul': return args.reduce((a, b) => a * b, 1);
        case 'div': {
          const divisor = at(1);
          if (divisor === 0) throw new Error('Деление на ноль в правиле');
          return at(0) / divisor;
        }
        case 'floor': return Math.floor(at(0));
        case 'ceil': return Math.ceil(at(0));
        case 'min': return Math.min(at(0), ...args.slice(1));
        case 'max': return Math.max(at(0), ...args.slice(1));
      }
    }
  }
}

function test(cond: Condition, ctx: EvalContext): boolean {
  switch (cond.kind) {
    case 'always': return true;
    case 'and': return cond.of.every((c) => test(c, ctx));
    case 'or': return cond.of.some((c) => test(c, ctx));
    case 'not': return !test(cond.of, ctx);
    case 'cmp': {
      const l = resolve(cond.left, ctx);
      const r = resolve(cond.right, ctx);
      switch (cond.op) {
        case 'eq': return l === r;
        case 'ne': return l !== r;
        case 'gt': return Number(l) > Number(r);
        case 'gte': return Number(l) >= Number(r);
        case 'lt': return Number(l) < Number(r);
        case 'lte': return Number(l) <= Number(r);
        case 'in': return String(r).split(',').includes(String(l));
        case 'notIn': return !String(r).split(',').includes(String(l));
      }
    }
  }
}

/**
 * Исполнитель правил. Чистая функция, без сайд-эффектов и без eval.
 * Один и тот же код на клиенте и на сервере — расхождений быть не может.
 */
export function evaluateRules(def: ProductRules, ctx: EvalContext): EvalResult {
  const result: EvalResult = {
    forbidden: {},
    required: [],
    addedParts: [],
    priceDelta: 0,
    paramRanges: {},
    valid: true,
    violations: [],
  };

  const ordered = [...def.rules].sort((a, b) => a.priority - b.priority);

  for (const rule of ordered) {
    if (!test(rule.when, ctx)) continue;
    for (const effect of rule.then) applyEffect(effect, ctx, result);
  }

  // Проверка выбранной конфигурации против собранных ограничений
  for (const [group, entries] of Object.entries(result.forbidden)) {
    const selected = ctx.options[group];
    if (!selected) continue;
    for (const entry of entries) {
      if (entry.options.includes(selected)) {
        result.valid = false;
        result.violations.push(entry.message);
      }
    }
  }
  for (const req of result.required) {
    if (ctx.options[req.group] !== req.option) {
      result.valid = false;
      result.violations.push(req.message);
    }
  }

  return result;
}

function applyEffect(effect: Effect, ctx: EvalContext, out: EvalResult): void {
  switch (effect.kind) {
    case 'forbid':
      (out.forbidden[effect.group] ??= []).push({
        options: effect.options,
        message: effect.message,
      });
      break;
    case 'require':
      out.required.push({ group: effect.group, option: effect.option, message: effect.message });
      break;
    case 'addPart':
      out.addedParts.push({
        part: effect.part,
        count: effect.count ? Number(resolve(effect.count, ctx)) : 1,
      });
      break;
    case 'priceDelta':
      out.priceDelta += Number(resolve(effect.amount, ctx));
      break;
    case 'setParamRange':
      out.paramRanges[effect.code] = {
        min: Number(resolve(effect.min, ctx)),
        max: Number(resolve(effect.max, ctx)),
      };
      break;
  }
}
