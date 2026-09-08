/**
 * Процедурные текстуры для демо-каталога.
 *
 * Нужны не для красоты: без текстур пайплайн не проходит через
 * textureCompress, и весь этап работы с картами остаётся непроверенным,
 * а именно он определяет бюджет видеопамяти на мобильных.
 *
 * Генерация детерминированная: одинаковый вход даёт одинаковый файл,
 * иначе checksum ассета менялся бы на каждом прогоне и пайплайн терял
 * бы идемпотентность.
 */
import sharp from 'sharp';

/** Быстрый детерминированный шум без внешних зависимостей. */
function hashNoise(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 69069) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothNoise(x, y, scale, seed) {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const lerp = (a, b, t) => a + (b - a) * t * t * (3 - 2 * t);

  return lerp(
    lerp(hashNoise(x0, y0, seed), hashNoise(x0 + 1, y0, seed), fx),
    lerp(hashNoise(x0, y0 + 1, seed), hashNoise(x0 + 1, y0 + 1, seed), fx),
    fy,
  );
}

/** Дубовая текстура: годичные кольца плюс мелкое волокно. */
export async function woodTexture(size = 512) {
  const data = Buffer.alloc(size * size * 3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const warp = smoothNoise(x, y, 90, 7) * 26;
      const rings = Math.sin((x + warp) * 0.09) * 0.5 + 0.5;
      const grain = smoothNoise(x, y, 3, 11) * 0.18;
      const tone = 0.62 + rings * 0.22 + grain;

      const index = (y * size + x) * 3;
      data[index] = Math.min(255, Math.round(tone * 214));
      data[index + 1] = Math.min(255, Math.round(tone * 165));
      data[index + 2] = Math.min(255, Math.round(tone * 108));
    }
  }

  return sharp(data, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

/** Рогожка: переплетение нитей по двум осям. */
export async function fabricTexture(size = 512) {
  const data = Buffer.alloc(size * size * 3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const weave = (Math.sin(x * 0.8) * Math.sin(y * 0.8)) * 0.08;
      const fibre = smoothNoise(x, y, 2.5, 23) * 0.14;
      const tone = 0.55 + weave + fibre;

      const index = (y * size + x) * 3;
      data[index] = Math.round(tone * 150);
      data[index + 1] = Math.round(tone * 154);
      data[index + 2] = Math.round(tone * 150);
    }
  }

  return sharp(data, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

export const TEXTURE_BUILDERS = { wood: woodTexture, fabric: fabricTexture };
