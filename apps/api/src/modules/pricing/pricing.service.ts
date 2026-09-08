import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductRulesSchema, evaluateRules, type EvalContext } from '@furni/shared';
import { PrismaService } from '../../prisma/prisma.service';

export interface PriceRequest {
  productId: string;
  options: Record<string, string>;
  params: Record<string, number>;
}

export interface PriceBreakdown {
  basePriceCents: number;
  optionsCents: number;
  rulesCents: number;
  totalCents: number;
  currency: string;
  sku: string;
  valid: boolean;
  violations: string[];
}

/**
 * Авторитетный расчёт цены. Клиент считает предварительную цену тем же
 * кодом из @furni/shared для мгновенного отклика, но в заявку попадает
 * только результат этого сервиса (CLAUDE.md, правило 4).
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(tenantId: string, req: PriceRequest): Promise<PriceBreakdown> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: req.productId, published: true },
        include: {
          optionGroups: { include: { options: true } },
          rules: true,
        },
      });
      if (!product) throw new BadRequestException('Товар не найден или не опубликован');

      let optionsCents = 0;
      let sku = product.sku;
      const violations: string[] = [];

      for (const group of product.optionGroups) {
        const selectedCode = req.options[group.code];
        if (!selectedCode) {
          if (group.required) violations.push(`Не выбрано: ${group.label}`);
          continue;
        }
        const option = group.options.find((o) => o.code === selectedCode);
        if (!option) {
          throw new BadRequestException(
            `Опция ${selectedCode} не существует в группе ${group.code}`,
          );
        }
        optionsCents += option.priceDeltaCents;
        if (option.skuSuffix) sku += option.skuSuffix;
      }

      let rulesCents = 0;
      if (product.rules) {
        const def = ProductRulesSchema.parse(product.rules.dsl);
        const ctx: EvalContext = {
          params: req.params,
          options: req.options,
          basePrice: product.basePriceCents,
        };
        const result = evaluateRules(def, ctx);
        rulesCents = Math.round(result.priceDelta);
        violations.push(...result.violations);
      }

      const totalCents = product.basePriceCents + optionsCents + rulesCents;
      if (totalCents < 0) throw new BadRequestException('Отрицательная цена: проверьте правила');

      return {
        basePriceCents: product.basePriceCents,
        optionsCents,
        rulesCents,
        totalCents,
        currency: product.currency,
        sku,
        valid: violations.length === 0,
        violations,
      };
    });
  }
}
