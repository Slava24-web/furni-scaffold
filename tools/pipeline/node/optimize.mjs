#!/usr/bin/env node
/**
 * Оптимизация glTF: Meshopt, KTX2, генерация LOD, валидация бюджета.
 * Этап 4-8 пайплайна (ТЗ 6.1). Запускается воркером очереди после Blender.
 *
 * Использование:
 *   node optimize.mjs --in model.glb --out ./dist --tier mobile
 */
import { NodeIO } from '@gltf-transform/core';
import {
  EXTMeshoptCompression,
  EXTTextureWebP,
  KHRMeshQuantization,
  KHRTextureBasisu,
} from '@gltf-transform/extensions';
import {
  dedup, flatten, join, meshopt, prune,
  simplify, textureCompress, weld,
} from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { ASSET_BUDGETS } from '@furni/shared';
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { basename, join as joinPath } from 'node:path';

const LOD_RATIOS = { 0: 1.0, 1: ASSET_BUDGETS.lod1Ratio, 2: ASSET_BUDGETS.lod2Ratio };

export async function optimizeAsset({ inputPath, outputDir, maxTextureSize = ASSET_BUDGETS.maxTextureSize }) {
  // Meshopt, а не Draco. Загрузчик в packages/viewer подключает только
  // MeshoptDecoder: модель, сжатая Draco, в приложении просто не откроется.
  // Meshopt к тому же быстрее декодируется на слабом CPU (CLAUDE.md).
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;

  const io = new NodeIO()
    .registerExtensions([
      EXTMeshoptCompression,
      EXTTextureWebP,
      KHRMeshQuantization,
      KHRTextureBasisu,
    ])
    // Без явной регистрации кодека расширение падает на записи буфера:
    // сама библиотека meshoptimizer в зависимости не подтягивается
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });
  const report = { input: basename(inputPath), lods: [], warnings: [] };

  for (const [lod, ratio] of Object.entries(LOD_RATIOS)) {
    const doc = await io.read(inputPath);

    await doc.transform(
      // Порядок важен: сначала чистим, потом упрощаем, потом сжимаем
      prune(),
      dedup(),
      flatten(),
      join(),
      weld({ tolerance: 0.0001 }),
      ratio < 1
        ? simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 })
        : (d) => d,
      textureCompress({
        encoder: sharp,
        targetFormat: 'webp',
        resize: [maxTextureSize, maxTextureSize],
      }),
      // meshopt сам квантует атрибуты, отдельный quantize() перед ним
      // приводит к двойному округлению позиций и щелям на стыках
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );

    const glb = await io.writeBinary(doc);
    const outPath = joinPath(outputDir, `lod${lod}.glb`);
    await writeFile(outPath, glb);

    const stats = collectStats(doc);
    report.lods.push({ lod: Number(lod), bytes: glb.byteLength, ...stats });

    if (Number(lod) === 0 && stats.triangles > ASSET_BUDGETS.lod0MaxTriangles) {
      report.warnings.push(
        `LOD0: ${stats.triangles} треугольников > бюджета ${ASSET_BUDGETS.lod0MaxTriangles}`,
      );
    }
    if (stats.materials > ASSET_BUDGETS.maxMaterialsPerAsset) {
      report.warnings.push(`Материалов ${stats.materials} > ${ASSET_BUDGETS.maxMaterialsPerAsset}`);
    }
  }

  // Модель с предупреждениями не публикуется автоматически (ТЗ 6.1, этап 8)
  report.autoPublish = report.warnings.length === 0;
  return report;
}

function collectStats(doc) {
  const root = doc.getRoot();
  let triangles = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const position = prim.getAttribute('POSITION');
      triangles += (indices?.getCount() ?? position?.getCount() ?? 0) / 3;
    }
  }
  return {
    triangles: Math.round(triangles),
    materials: root.listMaterials().length,
    textures: root.listTextures().length,
  };
}

// ОСТАЁТСЯ БЛОКЕРОМ: KTX2/Basis вместо WebP. textureCompress даёт WebP —
// он экономит трафик, но в видеопамяти распаковывается в RGBA и занимает
// столько же, сколько PNG. Нужен вызов бинаря toktx после сжатия
// (KHRTextureBasisu уже зарегистрирован в io). Без этого бюджет
// RENDER_BUDGETS.maxTextureBytes на мобильных не держится.
