#!/usr/bin/env node
/**
 * Генерация демо-каталога тенанта `test` и прогон его через пайплайн.
 *
 * Заменяет отсутствующие модели реального клиента. На выходе — настоящие
 * GLB с LOD 0/1/2, сжатые meshopt, плюс манифест каталога, который читают
 * и приложение, и сид БД.
 *
 * Запуск: pnpm --filter @furni/pipeline models:test
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_BUDGETS } from '@furni/shared';
import { MATERIALS, PRODUCTS, TEST_TENANT, buildProductGeometry } from './catalog.mjs';
import { boundsMm, triangleCount } from './geometry.mjs';
import { buildDocument, writeGlb } from './gltf.mjs';
import { TEXTURE_BUILDERS } from './textures.mjs';
import { optimizeAsset } from './optimize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

/** Куда кладём исходники до оптимизации — в репозиторий не попадают. */
const SOURCE_DIR = join(repoRoot, 'tools/pipeline/out/source');
/** Публичная выдача: dev-сервер отдаёт её вместо CDN. */
const PUBLIC_DIR = join(repoRoot, 'apps/web/public/assets/test');

async function main() {
  await rm(SOURCE_DIR, { recursive: true, force: true });
  await mkdir(SOURCE_DIR, { recursive: true });
  await rm(PUBLIC_DIR, { recursive: true, force: true });
  await mkdir(PUBLIC_DIR, { recursive: true });

  const textures = {};
  for (const [key, build] of Object.entries(TEXTURE_BUILDERS)) {
    textures[key] = await build(ASSET_BUDGETS.maxTextureSize / 2);
  }

  const manifest = {
    tenant: TEST_TENANT,
    materials: Object.values(MATERIALS).map(({ code, name, priceModifierCents }) => ({
      code,
      name,
      priceModifierCents,
    })),
    products: [],
  };

  for (const product of PRODUCTS) {
    const groups = buildProductGeometry(product);
    const sourceTriangles = groups.reduce((sum, g) => sum + triangleCount(g.geometry), 0);
    const bounds = boundsMm({
      positions: groups.flatMap((g) => g.geometry.positions),
      indices: [],
    });

    // Санитарная проверка контракта: origin — низ-центр габарита.
    // Модель, «висящая» над полом, ломает расстановку и снаппинг.
    if (Math.abs(bounds.minYMm) > 2) {
      throw new Error(`${product.sku}: origin не на полу, низ габарита ${bounds.minYMm} мм`);
    }

    const doc = buildDocument({
      name: product.sku,
      groups,
      materials: MATERIALS,
      textures: usedTextures(groups, textures),
    });

    const glb = await writeGlb(doc);
    const sourcePath = join(SOURCE_DIR, `${product.sku}.glb`);
    await writeFile(sourcePath, glb);

    const outputDir = join(PUBLIC_DIR, product.sku);
    await mkdir(outputDir, { recursive: true });
    const report = await optimizeAsset({ inputPath: sourcePath, outputDir });

    manifest.products.push({
      sku: product.sku,
      name: product.name,
      category: product.category,
      type: product.type,
      basePriceCents: product.basePriceCents,
      widthMm: bounds.widthMm,
      heightMm: bounds.heightMm,
      depthMm: bounds.depthMm,
      /** Высота установки низа модели: верхние шкафы висят на стене */
      mountHeightMm: product.mountHeightMm,
      /** Участвует ли объект в привязке к стенам */
      snapToWall: product.snapToWall,
      /** Можно ли ставить объект на другие объекты */
      stackable: product.stackable,
      materials: groups.map((g) => g.material),
      /** Шаблон под AssetRef.urlTemplate из packages/viewer */
      urlTemplate: `/assets/test/${product.sku}/lod{lod}.glb`,
      checksum: createHash('sha256').update(glb).digest('hex'),
      sourceTriangles,
      lods: report.lods,
      warnings: report.warnings,
    });

    const sizes = report.lods.map((l) => `lod${l.lod} ${l.triangles} тр / ${kb(l.bytes)}`).join(', ');
    console.log(`${product.sku}: исходник ${sourceTriangles} тр -> ${sizes}`);
    for (const warning of report.warnings) console.warn(`  ! ${warning}`);
  }

  await writeFile(join(PUBLIC_DIR, 'catalog.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`\nМанифест: ${join(PUBLIC_DIR, 'catalog.json')}`);
}

/** В документ кладём только те текстуры, что реально используются. */
function usedTextures(groups, textures) {
  const used = {};
  for (const group of groups) {
    const key = MATERIALS[group.material]?.texture;
    if (key && textures[key]) used[key] = textures[key];
  }
  return used;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} КБ`;

await main();
