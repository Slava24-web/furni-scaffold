import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deterministicUuid, emptySceneDoc, type SceneDoc } from '@furni/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { QuoteService } from './quote.service';
import { LeadsService } from '../leads/leads.service';
import { LeadWebhookService, sign } from '../leads/lead-webhook.service';

/**
 * Серверный расчёт сметы и приём заявки на живой БД.
 *
 * Проверяется главное правило ценообразования: в заявку попадает сумма,
 * посчитанная сервером, а не присланная браузером. Тест требует
 * поднятую БД:  pnpm db:up && pnpm db:migrate
 */

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

if (!DATABASE_URL) {
  console.warn('[quote] DATABASE_URL не задан, тест сметы пропущен');
}

suite('Смета и заявка', () => {
  const prisma = new PrismaService();
  const pricing = new PricingService(prisma);
  const quote = new QuoteService(pricing);
  const webhook = new LeadWebhookService();
  const leads = new LeadsService(prisma, quote, webhook);

  const tenant = { id: randomUUID(), slug: `quote-${Date.now()}` };
  const sku = `QUOTE-CAB-${Date.now()}`;
  const productId = deterministicUuid(sku);

  const contact = { name: 'Иван Петров', phone: '+7 900 000-00-00', consent: true as const };

  function doc(count: number): SceneDoc {
    const base = emptySceneDoc();
    return {
      ...base,
      placements: Array.from({ length: count }, () => ({
        instanceId: randomUUID(),
        productId,
        sku,
        position: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        options: {},
        params: {},
        anchoredToWallId: null,
        locked: false,
      })),
    };
  }

  beforeAll(async () => {
    await prisma.withTenant(tenant.id, async (tx) => {
      await tx.tenant.create({
        data: { id: tenant.id, slug: tenant.slug, name: 'Тенант сметы' },
      });
      await tx.product.create({
        data: {
          id: productId,
          tenantId: tenant.id,
          sku,
          name: 'Шкаф для сметы',
          basePriceCents: 100_000,
          published: true,
        },
      });
    });
  }, 30_000);

  afterAll(async () => {
    await prisma
      .withTenant(tenant.id, (tx) => tx.tenant.delete({ where: { id: tenant.id } }))
      .catch(() => undefined);
    await prisma.$disconnect();
  });

  it('считает сумму по сцене', async () => {
    const result = await quote.quote(tenant.id, doc(3));

    expect(result.totalCents).toBe(300_000);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.quantity).toBe(3);
    expect(result.valid).toBe(true);
  });

  it('пустая сцена даёт нулевую смету, а не ошибку', async () => {
    const result = await quote.quote(tenant.id, emptySceneDoc());
    expect(result.totalCents).toBe(0);
  });

  it('товар не из каталога не молчит: он попадает в список неизвестных', async () => {
    const stranger: SceneDoc = {
      ...doc(1),
      placements: [{ ...doc(1).placements[0]!, productId: randomUUID(), sku: 'ЧУЖОЙ' }],
    };
    const result = await quote.quote(tenant.id, stranger);

    expect(result.unknown).toEqual(['ЧУЖОЙ']);
    expect(result.valid).toBe(false);
  });

  it('чужой товар не считается: изоляция тенантов держится и здесь', async () => {
    const other = { id: randomUUID(), slug: `quote-other-${Date.now()}` };
    const otherSku = `QUOTE-OTHER-${Date.now()}`;
    const otherId = deterministicUuid(otherSku);

    await prisma.withTenant(other.id, async (tx) => {
      await tx.tenant.create({ data: { id: other.id, slug: other.slug, name: 'Чужой' } });
      await tx.product.create({
        data: {
          id: otherId,
          tenantId: other.id,
          sku: otherSku,
          name: 'Чужой шкаф',
          basePriceCents: 999_000,
          published: true,
        },
      });
    });

    const stolen: SceneDoc = {
      ...doc(1),
      placements: [{ ...doc(1).placements[0]!, productId: otherId, sku: otherSku }],
    };
    const result = await quote.quote(tenant.id, stolen);

    expect(result.totalCents).toBe(0);
    expect(result.unknown).toEqual([otherSku]);

    await prisma
      .withTenant(other.id, (tx) => tx.tenant.delete({ where: { id: other.id } }))
      .catch(() => undefined);
  });

  it('заявка сохраняет сумму сервера, а не присланную клиентом', async () => {
    const result = await leads.create(tenant.id, {
      contact,
      doc: doc(2),
      clientTotalCents: 1,
    });

    expect(result.totalCents).toBe(200_000);

    const stored = await prisma.withTenant(tenant.id, (tx) =>
      tx.lead.findFirst({ where: { id: result.id } }),
    );
    expect(stored?.totalCents).toBe(200_000);
  });

  it('заявка без согласия на обработку данных не принимается', async () => {
    await expect(
      leads.create(tenant.id, { contact: { ...contact, consent: false }, doc: doc(1) }),
    ).rejects.toThrow();
  });

  it('заявка без телефона не принимается', async () => {
    await expect(
      leads.create(tenant.id, { contact: { name: 'Иван', consent: true }, doc: doc(1) }),
    ).rejects.toThrow();
  });

  it('заявка по пустой сцене отклоняется', async () => {
    await expect(leads.create(tenant.id, { contact, doc: emptySceneDoc() })).rejects.toThrow();
  });

  it('кривой документ сцены отклоняется на разборе', () => {
    expect(() => quote.parse({ version: 999 })).toThrow();
  });

  it('без настроенной CRM заявка принимается и никуда не уходит', async () => {
    const result = await leads.create(tenant.id, { contact, doc: doc(1) });
    expect(result.delivered).toBe(false);
  });

  it('заявка уходит в CRM магазина подписанной', async () => {
    const calls: { body: string; signature: string | null }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      calls.push({
        body: String(init.body),
        signature: new Headers(init.headers).get('x-furni-signature'),
      });
      return new Response('ok', { status: 200 });
    }) as typeof fetch;

    await prisma.withTenant(tenant.id, (tx) =>
      tx.tenant.update({
        where: { id: tenant.id },
        data: { leadWebhookUrl: 'https://crm.example/hook', leadWebhookSecret: 'секрет' },
      }),
    );

    try {
      const result = await leads.create(tenant.id, { contact, doc: doc(2) });

      expect(result.delivered).toBe(true);
      expect(calls).toHaveLength(1);
      expect(JSON.parse(calls[0]!.body).totalCents).toBe(200_000);
      expect(calls[0]!.signature).toBe(sign(calls[0]!.body, 'секрет'));
    } finally {
      globalThis.fetch = original;
      await prisma.withTenant(tenant.id, (tx) =>
        tx.tenant.update({ where: { id: tenant.id }, data: { leadWebhookUrl: null } }),
      );
    }
  });

  it('недоступная CRM не отменяет заявку', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('сеть недоступна');
    }) as typeof fetch;

    await prisma.withTenant(tenant.id, (tx) =>
      tx.tenant.update({
        where: { id: tenant.id },
        data: { leadWebhookUrl: 'https://crm.example/hook' },
      }),
    );

    try {
      const result = await leads.create(tenant.id, { contact, doc: doc(1) });

      // Заявка сохранена, доставка провалилась — покупатель не виноват
      expect(result.delivered).toBe(false);
      const stored = await prisma.withTenant(tenant.id, (tx) =>
        tx.lead.findFirst({ where: { id: result.id } }),
      );
      expect(stored).not.toBeNull();
    } finally {
      globalThis.fetch = original;
      await prisma.withTenant(tenant.id, (tx) =>
        tx.tenant.update({ where: { id: tenant.id }, data: { leadWebhookUrl: null } }),
      );
    }
  });
});