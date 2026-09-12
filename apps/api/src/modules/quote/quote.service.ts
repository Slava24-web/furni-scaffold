import { Injectable } from '@nestjs/common';
import { SceneDocSchema, type Placement, type SceneDoc } from '@furni/shared';
import { PricingService } from '../pricing/pricing.service';

/**
 * Авторитетная смета по сцене.
 *
 * Клиент считает свою предварительную цену тем же кодом из @furni/shared
 * ради мгновенного отклика, но в заявку попадает только результат этого
 * сервиса (CLAUDE.md, правило 4). Клиенту нельзя верить: документ сцены
 * приходит из браузера, где его может поправить кто угодно.
 */

export interface QuoteLine {
  sku: string;
  productId: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
  /** Нарушения правил конфигурации: цена посчитана, но заказ спорный */
  violations: string[];
}

export interface SceneQuote {
  lines: QuoteLine[];
  totalCents: number;
  currency: string;
  /** Позиции, которых нет в каталоге тенанта или они сняты с продажи */
  unknown: string[];
  valid: boolean;
}

@Injectable()
export class QuoteService {
  constructor(private readonly pricing: PricingService) {}

  /** Разбор присланного документа. Кидает ZodError на кривой вход. */
  parse(doc: unknown): SceneDoc {
    return SceneDocSchema.parse(doc);
  }

  async quote(tenantId: string, doc: SceneDoc): Promise<SceneQuote> {
    // Одинаковые позиции считаются один раз: цена зависит от товара и
    // опций, а не от того, сколько копий стоит в сцене
    const groups = new Map<string, { placement: Placement; quantity: number }>();
    for (const placement of doc.placements) {
      const key = `${placement.productId}|${JSON.stringify(placement.options)}`;
      const existing = groups.get(key);
      if (existing) existing.quantity += 1;
      else groups.set(key, { placement, quantity: 1 });
    }

    const lines: QuoteLine[] = [];
    const unknown: string[] = [];
    let currency = 'RUB';

    for (const { placement, quantity } of groups.values()) {
      try {
        const price = await this.pricing.quote(tenantId, {
          productId: placement.productId,
          options: placement.options,
          params: placement.params,
        });
        currency = price.currency;
        lines.push({
          sku: placement.sku,
          productId: placement.productId,
          quantity,
          unitCents: price.totalCents,
          totalCents: price.totalCents * quantity,
          violations: price.violations,
        });
      } catch {
        // Товар мог быть снят с продажи после того, как сцену собрали.
        // Молча выкинуть его нельзя: заказчик видел его в смете
        unknown.push(placement.sku);
      }
    }

    const totalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
    return {
      lines,
      totalCents,
      currency,
      unknown,
      valid: unknown.length === 0 && lines.every((line) => line.violations.length === 0),
    };
  }
}
