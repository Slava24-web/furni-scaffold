import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { SceneDoc } from '@furni/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { QuoteService } from '../quote/quote.service';
import { LeadWebhookService } from './lead-webhook.service';

/**
 * Заявки покупателей.
 *
 * Единственное место в системе, где появляются персональные данные
 * (152-ФЗ): в сцене их нет и быть не должно. Контакт хранится в Lead
 * и больше нигде.
 *
 * Сумма пересчитывается на сервере и берётся ТОЛЬКО оттуда: цена,
 * присланная браузером, — это пожелание, а не цена (CLAUDE.md,
 * правило 4).
 */

export const LeadContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .min(6)
    .max(32)
    // Телефон нормализуется, но не проверяется на страну: у магазина
    // бывают заказчики из-за рубежа, а потерянная заявка дороже опечатки
    .regex(/^[+\d][\d\s\-()]*$/, 'Телефон содержит недопустимые символы'),
  email: z.string().trim().email().max(200).optional(),
  comment: z.string().trim().max(2000).optional(),
  /** Согласие на обработку ПДн: без него заявку принимать нельзя */
  consent: z.literal(true),
});

export type LeadContact = z.infer<typeof LeadContactSchema>;

export interface LeadResult {
  id: string;
  totalCents: number;
  currency: string;
  /** Расхождение с суммой, которую показывал клиент */
  clientTotalCents: number | null;
  /** Ушла ли заявка в CRM магазина */
  delivered: boolean;
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quote: QuoteService,
    private readonly webhook: LeadWebhookService,
  ) {}

  async create(
    tenantId: string,
    input: {
      contact: unknown;
      doc: unknown;
      sceneId?: string | undefined;
      clientTotalCents?: number | undefined;
    },
  ): Promise<LeadResult> {
    const contact = LeadContactSchema.parse(input.contact);
    const doc: SceneDoc = this.quote.parse(input.doc);
    if (doc.placements.length === 0) {
      throw new BadRequestException('Пустая сцена: нечего заказывать');
    }

    const quote = await this.quote.quote(tenantId, doc);

    // Расхождение не блокирует заявку: покупатель не виноват, что цена
    // изменилась, пока он собирал кухню. Но менеджер обязан о нём знать
    if (
      input.clientTotalCents !== undefined &&
      input.clientTotalCents !== quote.totalCents
    ) {
      this.logger.warn(
        `Заявка тенанта ${tenantId}: клиент показывал ${input.clientTotalCents}, ` +
          `сервер посчитал ${quote.totalCents}`,
      );
    }

    const { lead, target } = await this.prisma.withTenant(tenantId, async (tx) => {
      const created = await tx.lead.create({
        data: {
          tenantId,
          sceneId: input.sceneId ?? null,
          contact,
          totalCents: quote.totalCents,
        },
        select: { id: true, createdAt: true },
      });
      const tenant = await tx.tenant.findFirst({
        where: { id: tenantId },
        select: { leadWebhookUrl: true, leadWebhookSecret: true },
      });

      return {
        lead: created,
        target: tenant?.leadWebhookUrl
          ? { url: tenant.leadWebhookUrl, secret: tenant.leadWebhookSecret }
          : null,
      };
    });

    // Заявка уже сохранена: отправка в CRM её судьбу не решает
    const delivered = await this.webhook.send(target, {
      leadId: lead.id,
      tenantId,
      totalCents: quote.totalCents,
      currency: quote.currency,
      contact,
      createdAt: lead.createdAt.toISOString(),
    });

    return {
      id: lead.id,
      totalCents: quote.totalCents,
      currency: quote.currency,
      clientTotalCents: input.clientTotalCents ?? null,
      delivered,
    };
  }
}
