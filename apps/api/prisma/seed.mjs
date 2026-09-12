/**
 * Сид демо-тенанта `test`.
 *
 * Источник правды — манифест, который выпускает пайплайн
 * (apps/web/public/assets/test/catalog.json). Сначала генерируем модели,
 * потом сеем: так строки в products всегда соответствуют файлам в
 * хранилище, а не расходятся с ними.
 *
 * Запуск: pnpm db:seed (после pnpm models:test и pnpm db:migrate)
 */
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { deterministicUuid } from '@furni/shared';

const here = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(here, '../../../apps/web/public/assets/test/catalog.json');

const prisma = new PrismaClient();

/**
 * Группы опций и правила задаются здесь, а не в манифесте: манифест
 * описывает геометрию, а это коммерческая настройка тенанта.
 */
const OPTION_GROUPS = {
  'TEST-WRD-1200': [
    {
      code: 'facade',
      label: 'Фасад',
      uiType: 'swatch',
      options: [
        { code: 'oak', label: 'Дуб натуральный', priceDeltaCents: 0, skuSuffix: '-OAK' },
        { code: 'white', label: 'Белый', priceDeltaCents: -180000, skuSuffix: '-WHT' },
        { code: 'graphite', label: 'Графит', priceDeltaCents: 150000, skuSuffix: '-GRF' },
      ],
    },
    {
      code: 'handles',
      label: 'Ручки',
      uiType: 'select',
      options: [
        { code: 'steel', label: 'Сталь матовая', priceDeltaCents: 0 },
        { code: 'none', label: 'Без ручек, push-to-open', priceDeltaCents: 240000 },
      ],
    },
  ],
  'TEST-SBD-1200': [
    {
      code: 'facade',
      label: 'Фасад',
      uiType: 'swatch',
      options: [
        { code: 'oak', label: 'Дуб натуральный', priceDeltaCents: 0, skuSuffix: '-OAK' },
        { code: 'white', label: 'Белый', priceDeltaCents: -90000, skuSuffix: '-WHT' },
      ],
    },
  ],
};

/**
 * Правила конфигурации в DSL из packages/shared. Проверяются тем же
 * исполнителем, что и на клиенте (CLAUDE.md, правило 4).
 */
const RULES = {
  'TEST-WRD-1200': {
    productType: 'static',
    params: [],
    assembly: [],
    rules: [
      {
        id: 'graphite-requires-steel',
        priority: 100,
        when: {
          kind: 'cmp',
          left: { kind: 'option', group: 'facade' },
          op: 'eq',
          right: { kind: 'const', value: 'graphite' },
        },
        then: [
          {
            kind: 'require',
            group: 'handles',
            option: 'steel',
            message: 'На графитовый фасад push-to-open не ставится: нужны стальные ручки',
          },
        ],
      },
    ],
  },
};

async function main() {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8')).valueOf();
  const slug = manifest.tenant.slug;

  // Через ту же функцию, что и middleware: политика RLS обычный SELECT
  // по tenants не пропустит
  const existing = await prisma.$queryRaw`SELECT id FROM resolve_tenant(${slug})`;
  const tenantId = existing[0]?.id ?? randomUUID();

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);

      await tx.tenant.upsert({
        where: { id: tenantId },
        create: {
          id: tenantId,
          slug,
          name: manifest.tenant.name,
          plan: 'growth',
          allowedOrigins: manifest.tenant.allowedOrigins,
        },
        update: { name: manifest.tenant.name, allowedOrigins: manifest.tenant.allowedOrigins },
      });

      // Пересев идемпотентен: старые товары удаляются каскадом вместе
      // с ассетами, опциями и правилами
      await tx.product.deleteMany({ where: { tenantId } });
      await tx.material.deleteMany({ where: { tenantId } });

      for (const material of manifest.materials) {
        await tx.material.create({
          data: {
            tenantId,
            code: material.code,
            name: material.name,
            priceModifierCents: material.priceModifierCents,
          },
        });
      }

      for (const item of manifest.products) {
        const product = await tx.product.create({
          data: {
            // Идентификатор выводится из артикула той же функцией, что и
            // на клиенте: сцена ссылается на товар до всякого обращения
            // к API, и случайный uuid делал бы серверный расчёт цены
            // невозможным
            id: deterministicUuid(item.sku),
            tenantId,
            sku: item.sku,
            name: item.name,
            category: item.category,
            type: item.type,
            basePriceCents: item.basePriceCents,
            widthMm: item.widthMm,
            heightMm: item.heightMm,
            depthMm: item.depthMm,
            published: true,
          },
        });

        for (const lod of item.lods) {
          await tx.asset.create({
            data: {
              tenantId,
              productId: product.id,
              kind: 'mesh',
              status: 'ready',
              uri: item.urlTemplate.replace('{lod}', String(lod.lod)),
              lodLevel: lod.lod,
              bytes: lod.bytes,
              triCount: lod.triangles,
              checksum: item.checksum,
              report: { warnings: item.warnings ?? [] },
            },
          });
        }

        for (const group of OPTION_GROUPS[item.sku] ?? []) {
          const created = await tx.optionGroup.create({
            data: {
              tenantId,
              productId: product.id,
              code: group.code,
              label: group.label,
              uiType: group.uiType,
            },
          });
          for (const [index, option] of group.options.entries()) {
            await tx.option.create({
              data: {
                tenantId,
                groupId: created.id,
                code: option.code,
                label: option.label,
                priceDeltaCents: option.priceDeltaCents,
                skuSuffix: option.skuSuffix ?? null,
                sortOrder: index,
              },
            });
          }
        }

        if (RULES[item.sku]) {
          await tx.productRule.create({
            data: { tenantId, productId: product.id, dsl: RULES[item.sku] },
          });
        }
      }
    },
    { timeout: 30_000 },
  );

  console.log(
    `Тенант ${slug} (${tenantId}): ${manifest.products.length} товаров, ` +
      `${manifest.materials.length} материалов`,
  );
}

await main().finally(() => prisma.$disconnect());
