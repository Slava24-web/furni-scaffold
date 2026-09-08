import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from './prisma.service';

/**
 * Изоляция тенантов на живой БД.
 *
 * Проверяется не код приложения, а страховка под ним: политики RLS.
 * Тест обязателен по CLAUDE.md (правило 5) — таблица без работающей
 * политики это утечка данных между магазинами, а не мелкий баг.
 *
 * Требует поднятую БД и применённый rls.sql:
 *   pnpm db:up && pnpm db:migrate
 */

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

if (!DATABASE_URL) {
  console.warn('[tenant-isolation] DATABASE_URL не задан, тест изоляции пропущен');
}

suite('Изоляция тенантов через RLS', () => {
  const prisma = new PrismaService();
  const tenantA = { id: randomUUID(), slug: `test-a-${Date.now()}` };
  const tenantB = { id: randomUUID(), slug: `test-b-${Date.now()}` };
  let productA = '';
  let productB = '';

  async function createTenant(tenant: { id: string; slug: string }, sku: string): Promise<string> {
    return prisma.withTenant(tenant.id, async (tx) => {
      await tx.tenant.create({
        data: { id: tenant.id, slug: tenant.slug, name: `Тенант ${tenant.slug}` },
      });
      const product = await tx.product.create({
        data: {
          tenantId: tenant.id,
          sku,
          name: `Товар ${sku}`,
          basePriceCents: 100_000,
          published: true,
        },
      });
      return product.id;
    });
  }

  beforeAll(async () => {
    productA = await createTenant(tenantA, 'ISO-A');
    productB = await createTenant(tenantB, 'ISO-B');
  }, 30_000);

  afterAll(async () => {
    for (const tenant of [tenantA, tenantB]) {
      await prisma
        .withTenant(tenant.id, (tx) => tx.tenant.delete({ where: { id: tenant.id } }))
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('видит только свои товары', async () => {
    const products = await prisma.withTenant(tenantA.id, (tx) => tx.product.findMany());
    expect(products).toHaveLength(1);
    expect(products[0]?.sku).toBe('ISO-A');
  });

  it('не отдаёт чужой товар при подмене id в запросе', async () => {
    // Главный сценарий атаки: клиент подставляет чужой uuid в тело запроса.
    // Фильтр по tenantId в коде можно забыть, RLS забыть нельзя.
    const stolen = await prisma.withTenant(tenantA.id, (tx) =>
      tx.product.findFirst({ where: { id: productB } }),
    );
    expect(stolen).toBeNull();
  });

  it('не даёт обновить чужую запись', async () => {
    const updated = await prisma.withTenant(tenantA.id, (tx) =>
      tx.product.updateMany({ where: { id: productB }, data: { name: 'Взломано' } }),
    );
    expect(updated.count).toBe(0);

    const intact = await prisma.withTenant(tenantB.id, (tx) =>
      tx.product.findFirst({ where: { id: productB } }),
    );
    expect(intact?.name).toBe('Товар ISO-B');
  });

  it('не даёт удалить чужую запись', async () => {
    const deleted = await prisma.withTenant(tenantA.id, (tx) =>
      tx.product.deleteMany({ where: { id: productB } }),
    );
    expect(deleted.count).toBe(0);
  });

  it('не даёт записать строку с чужим tenant_id', async () => {
    // WITH CHECK политики: подделать принадлежность на вставке нельзя
    await expect(
      prisma.withTenant(tenantA.id, (tx) =>
        tx.product.create({
          data: {
            tenantId: tenantB.id,
            sku: 'ISO-FAKE',
            name: 'Подделка',
            basePriceCents: 1,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('без контекста тенанта не видно ничего', async () => {
    // Транзакции нет, SET LOCAL не выставлен: current_tenant_id() = NULL
    const rows = await prisma.product.findMany();
    expect(rows).toHaveLength(0);
  });

  it('resolve_tenant отдаёт тенанта по slug и молчит на чужом', async () => {
    const found = await prisma.$queryRaw<
      { id: string }[]
    >`SELECT id FROM resolve_tenant(${tenantA.slug})`;
    expect(found[0]?.id).toBe(tenantA.id);

    const missing = await prisma.$queryRaw`SELECT id FROM resolve_tenant('нет-такого')`;
    expect(missing).toHaveLength(0);
  });

  it('withTenant отклоняет некорректный tenantId, а не подставляет его в SQL', async () => {
    // SET LOCAL не принимает параметры, значение уходит в строку запроса:
    // без строгой валидации это была бы инъекция
    await expect(
      prisma.withTenant("'; DROP TABLE products; --", async () => undefined),
    ).rejects.toThrow(/Некорректный tenantId/);

    const products = await prisma.withTenant(tenantA.id, (tx) => tx.product.count());
    expect(products).toBe(1);
  });
});
