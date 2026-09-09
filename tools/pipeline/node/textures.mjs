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

/**
 * Дубовая текстура: годичные кольца плюс мелкое волокно.
 *
 * Контраст колец намеренно низкий. Выразительный рисунок на модели
 * размером с фасад читается как пластик под дерево: у настоящего шпона
 * перепад тона мягкий, а рисунок мелкий.
 */
export async function woodTexture(size = 512) {
  const data = Buffer.alloc(size * size * 3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const warp = smoothNoise(x, y, 130, 7) * 18;
      const rings = Math.sin((x + warp) * 0.055) * 0.5 + 0.5;
      const grain = smoothNoise(x, y, 2.2, 11) * 0.09;
      const tone = 0.82 + rings * 0.1 + grain;

      const index = (y * size + x) * 3;
      data[index] = clampByte(tone * 196);
      data[index + 1] = clampByte(tone * 158);
      data[index + 2] = clampByte(tone * 116);
    }
  }

  return sharp(data, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

/** Рогожка: переплетение нитей по двум осям. */
export async function fabricTexture(size = 512) {
  const data = Buffer.alloc(size * size * 3);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const weave = Math.sin(x * 0.8) * Math.sin(y * 0.8) * 0.05;
      const fibre = smoothNoise(x, y, 2.2, 23) * 0.09;
      const tone = 0.86 + weave + fibre;

      const index = (y * size + x) * 3;
      data[index] = clampByte(tone * 132);
      data[index + 1] = clampByte(tone * 136);
      data[index + 2] = clampByte(tone * 132);
    }
  }

  return sharp(data, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

export const TEXTURE_BUILDERS = { wood: woodTexture, fabric: fabricTexture };
