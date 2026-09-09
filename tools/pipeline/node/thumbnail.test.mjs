import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { segmentedBox } from './geometry.mjs';
import { renderThumbnail } from './thumbnail.mjs';
import { MATERIALS, PRODUCTS, buildProductGeometry } from './catalog.mjs';

const cube = () => [{ material: 'white', geometry: segmentedBox(600, 600, 600, 1) }];

/** Доля непрозрачных пикселей: по ней видно, что модель вообще нарисована. */
async function coverage(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let opaque = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 128) opaque++;
  return opaque / (info.width * info.height);
}

describe('превью изделия', () => {
  it('отдаёт PNG заданного размера', async () => {
    const png = await renderThumbnail(cube(), MATERIALS, { width: 128, height: 96 });
    const meta = await sharp(png).metadata();

    expect(meta.format).toBe('png');
    expect(meta.width).toBe(128);
    expect(meta.height).toBe(96);
  });

  it('модель занимает заметную часть кадра', async () => {
    // Куб в три четверти закрывает около трети кадра; полупустая
    // картинка означала бы промах вписывания
    expect(await coverage(await renderThumbnail(cube(), MATERIALS))).toBeGreaterThan(0.2);
  });

  it('фон остаётся прозрачным', async () => {
    const png = await renderThumbnail(cube(), MATERIALS);
    const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Левый верхний угол заведомо вне модели
    expect(data[3]).toBe(0);
  });

  it('пустая модель даёт пустой кадр, а не падение', async () => {
    const png = await renderThumbnail([], MATERIALS, { width: 64, height: 64 });
    expect(await coverage(png)).toBe(0);
  });

  it('вырожденная геометрия не роняет рендер', async () => {
    const flat = [{ material: 'white', geometry: { positions: [0, 0, 0], normals: [0, 1, 0], indices: [] } }];
    await expect(renderThumbnail(flat, MATERIALS, { width: 32, height: 32 })).resolves.toBeInstanceOf(Buffer);
  });

  it('результат детерминирован: одинаковый вход даёт одинаковый файл', async () => {
    const first = await renderThumbnail(cube(), MATERIALS, { width: 64, height: 48 });
    const second = await renderThumbnail(cube(), MATERIALS, { width: 64, height: 48 });
    expect(first.equals(second)).toBe(true);
  });

  it('материалы различаются по цвету', async () => {
    const light = await renderThumbnail(cube(), MATERIALS);
    const dark = await renderThumbnail(
      [{ material: 'graphite', geometry: segmentedBox(600, 600, 600, 1) }],
      MATERIALS,
    );
    expect(light.equals(dark)).toBe(false);
  });

  it('каждое изделие каталога рисуется непустым', async () => {
    for (const product of PRODUCTS) {
      const png = await renderThumbnail(buildProductGeometry(product), MATERIALS, {
        width: 96,
        height: 72,
      });
      const filled = await coverage(png);
      expect(filled, product.sku).toBeGreaterThan(0.02);
    }
  }, 30_000);
});
