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
import sharp from 'sharp';
import { ASSET_BUDGETS } from '@furni/shared';
import { MATERIALS, PRODUCTS, TEST_TENANT, buildProductGeometry, finishesFor } from './catalog.mjs';
import { boundsMm, triangleCount } from './geometry.mjs';
import { buildDocument, writeGlb } from './gltf.mjs';
import { renderThumbnail } from './thumbnail.mjs';
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

  // Материалы для превью: растеризатор текстуры не сэмплирует, поэтому
  // текстурные материалы подменяются их средним тоном. Считается из самой
  // текстуры, а не задаётся руками, — иначе превью разъедется с моделью
  // при первой же правке рисунка.
  const previewMaterials = await materialsForPreview(textures);

  // Текстуры выкладываются отдельными файлами: клиент собирает материалы
  // сам, иначе сменить отделку на текстурную было бы нечем — в GLB лежат
  // только те карты, что использованы моделью
  const textureDir = join(PUBLIC_DIR, 'textures');
  await mkdir(textureDir, { recursive: true });
  const textureUrls = {};
  for (const [key, image] of Object.entries(textures)) {
    const webp = await sharp(image).webp({ quality: 86 }).toBuffer();
    await writeFile(join(textureDir, `${key}.webp`), webp);
    textureUrls[key] = `/assets/test/textures/${key}.webp`;
  }

  const manifest = {
    tenant: TEST_TENANT,
    materials: Object.values(MATERIALS).map((material) => ({
      code: material.code,
      name: material.name,
      priceModifierCents: material.priceModifierCents,
      baseColorFactor: material.baseColorFactor,
      roughness: material.roughness,
      metallic: material.metallic,
      ...(material.texture ? { textureUrl: textureUrls[material.texture] } : {}),
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

    // Превью для каталога: рисуется по той же геометрии, что и модель,
    // поэтому не расходится с ней (AssetKind.thumb в схеме БД)
    await writeFile(join(outputDir, 'thumb.png'), await renderThumbnail(groups, previewMaterials));

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
      /** Слоты отделки: какие материалы модели можно подменить */
      finishes: finishesFor(groups.map((g) => g.material)),
      /** Шаблон под AssetRef.urlTemplate из packages/viewer */
      urlTemplate: `/assets/test/${product.sku}/lod{lod}.glb`,
      thumbnailUrl: `/assets/test/${product.sku}/thumb.png`,
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

/** Средний тон текстуры в линейном пространстве. */
async function averageColour(image) {
  const { channels } = await sharp(image).stats();
  return channels.slice(0, 3).map((channel) => (channel.mean / 255) ** 2.2);
}

/** Копия материалов, где текстурный цвет свёрнут в один тон. */
async function materialsForPreview(textures) {
  const preview = {};
  for (const [code, material] of Object.entries(MATERIALS)) {
    if (!material.texture || !textures[material.texture]) {
      preview[code] = material;
      continue;
    }

    const tint = await averageColour(textures[material.texture]);
    preview[code] = {
      ...material,
      baseColorFactor: [
        material.baseColorFactor[0] * tint[0],
        material.baseColorFactor[1] * tint[1],
        material.baseColorFactor[2] * tint[2],
        1,
      ],
    };
  }
  return preview;
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
