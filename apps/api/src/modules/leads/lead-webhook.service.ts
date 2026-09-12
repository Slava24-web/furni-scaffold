import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';

/**
 * Отправка заявки в CRM магазина.
 *
 * Заявка, лежащая в нашей базе, магазину бесполезна: работают в своей
 * воронке, а не в чужой админке. Вызов идёт после сохранения и никогда
 * не роняет приём: недоступная CRM не должна стоить магазину заказа.
 *
 * Тело подписывается общим секретом: получатель обязан убедиться, что
 * зовём мы, а не тот, кто подсмотрел адрес.
 */

/** Дольше ждать нечего: заявка уже сохранена, повтор сделает очередь. */
const TIMEOUT_MS = 5000;

export interface LeadPayload {
  leadId: string;
  tenantId: string;
  totalCents: number;
  currency: string;
  contact: Record<string, unknown>;
  createdAt: string;
}

export interface WebhookTarget {
  url: string;
  secret: string | null;
}

@Injectable()
export class LeadWebhookService {
  private readonly logger = new Logger(LeadWebhookService.name);

  /**
   * Возвращает true, если CRM приняла вызов.
   *
   * Ошибка не выбрасывается: заявка уже в базе, и падение здесь означало
   * бы 500 покупателю после успешной отправки формы.
   */
  async send(target: WebhookTarget | null, payload: LeadPayload): Promise<boolean> {
    if (!target?.url) return false;

    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'furni-planner/1',
    };
    if (target.secret) headers['x-furni-signature'] = sign(body, target.secret);

    try {
      const response = await fetch(target.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(`CRM ответила ${response.status} на заявку ${payload.leadId}`);
        return false;
      }
      return true;
    } catch (cause) {
      this.logger.warn(
        `CRM недоступна для заявки ${payload.leadId}: ${cause instanceof Error ? cause.message : cause}`,
      );
      return false;
    }
  }
}

/** Подпись тела: HMAC-SHA256 в hex. */
export function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}
