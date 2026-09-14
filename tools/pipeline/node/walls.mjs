/**
 * Отделка стен демо-тенанта `test`: краска и обои.
 *
 * Стена — второй по площади план после пола, и серая штукатурка вокруг
 * гарнитура искажает впечатление от цвета фасадов сильнее, чем кажется:
 * дуб на тёплой охре и тот же дуб на холодном сером выглядят разным
 * деревом. Без выбора отделки стен планировка врёт про цвет.
 *
 * Краска — это ровный тон с едва заметной шагренью валика. Обои — рисунок
 * с раппортом, и раппорт обязателен: без физического размера полоса
 * растягивается на всю стену и превращается в непонятный градиент.
 *
 * Текстура рисуется процедурно и детерминированно, как и напольная:
 * одинаковый вход даёт одинаковый файл, иначе пайплайн теряет
 * идемпотентность.
 */
import sharp from 'sharp';

const clampByte = (value) => Math.max(0, Math.min(255, Math.round(value)));

/** Шум, замкнутый по обеим осям: иначе на стыке плиток виден шов. */
function noise(ix, iy, period, seed) {
  const x = ((ix % period) + period) % period;
  const y = ((iy % period) + period) % period;
  let h = (x * 374761393 + y * 668265263 + seed * 69069) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * Рисунок отделки: множитель яркости в точке.
 *
 * Возвращает число около единицы. Так узор не зависит от цвета, и одна
 * и та же полоска работает и на белой, и на тёмной стене.
 */
function pattern(kind, xMm, yMm, spec, sizePx, repeatMm) {
  const px = (xMm / repeatMm) * sizePx;
  const py = (yMm / repeatMm) * sizePx;

  if (kind === 'paint') {
    // Шагрень валика: мелкое зерно, почти незаметное вблизи
    const grain = noise(Math.floor(px / 2), Math.floor(py / 2), sizePx / 2, spec.seed ?? 7);
    return 0.985 + grain * 0.03;
  }

  if (kind === 'stripe') {
    // Полоса: чередование тона с мягкой границей
    const stripe = Math.sin((xMm / spec.stripeMm) * Math.PI) ;
    const soft = stripe > 0 ? 1 : 0.93;
    const fibre = noise(Math.floor(px / 3), Math.floor(py / 3), sizePx / 3, spec.seed ?? 11);
    return soft + fibre * 0.02;
  }

  if (kind === 'linen') {
    // Рогожка: переплетение нитей по обеим осям
    const warp = Math.sin((xMm / spec.threadMm) * Math.PI * 2) * 0.5 + 0.5;
    const weft = Math.sin((yMm / spec.threadMm) * Math.PI * 2) * 0.5 + 0.5;
    const weave = (warp * 0.6 + weft * 0.4) * 0.09;
    const fibre = noise(Math.floor(px), Math.floor(py), sizePx, spec.seed ?? 13);
    return 0.95 + weave + fibre * 0.03;
  }

  if (kind === 'plaster') {
    // Декоративная штукатурка: широкие мазки
    const sweep =
      Math.sin(xMm * 0.012 + Math.sin(yMm * 0.008) * 2.4) * 0.5 + 0.5;
    const grain = noise(Math.floor(px / 2), Math.floor(py / 2), sizePx / 2, spec.seed ?? 17);
    return 0.93 + sweep * 0.09 + grain * 0.04;
  }

  return 1;
}

/**
 * Текстура отделки стены.
 *
 * @param {number} sizePx сторона изображения
 * @param {{kind: string, repeatMm: number, colour: number[],
 *          stripeMm?: number, threadMm?: number, seed?: number}} spec
 */
export async function wallTexture(sizePx, spec) {
  const { repeatMm, colour } = spec;
  const data = Buffer.alloc(sizePx * sizePx * 3);
  const mmPerPx = repeatMm / sizePx;

  for (let py = 0; py < sizePx; py++) {
    for (let px = 0; px < sizePx; px++) {
      const tone = pattern(spec.kind, px * mmPerPx, py * mmPerPx, spec, sizePx, repeatMm);
      const index = (py * sizePx + px) * 3;
      data[index] = clampByte(colour[0] * tone);
      data[index + 1] = clampByte(colour[1] * tone);
      data[index + 2] = clampByte(colour[2] * tone);
    }
  }

  return sharp(data, { raw: { width: sizePx, height: sizePx, channels: 3 } }).png().toBuffer();
}

/**
 * Ряд отделок тенанта.
 *
 * Раппорт обоев взят из ходового: полоса 53 см — ширина рулона, рогожка
 * и штукатурка бесшовные, им раппорт нужен только как масштаб рисунка.
 * Краска матовая: глянцевая стена ловит блики и спорит с фасадами.
 */
export const WALL_FINISHES = [
  {
    code: 'wall-paint-white',
    name: 'Краска «Белая»',
    kind: 'Краска',
    pattern: 'paint',
    repeatMm: 1000,
    colour: [236, 234, 229],
    roughness: 0.95,
  },
  {
    code: 'wall-paint-linen',
    name: 'Краска «Лён»',
    kind: 'Краска',
    pattern: 'paint',
    repeatMm: 1000,
    colour: [223, 214, 197],
    roughness: 0.95,
  },
  {
    code: 'wall-paint-sage',
    name: 'Краска «Шалфей»',
    kind: 'Краска',
    pattern: 'paint',
    repeatMm: 1000,
    colour: [176, 186, 170],
    roughness: 0.95,
  },
  {
    code: 'wall-paint-clay',
    name: 'Краска «Глина»',
    kind: 'Краска',
    pattern: 'paint',
    repeatMm: 1000,
    colour: [196, 165, 146],
    roughness: 0.95,
  },
  {
    code: 'wall-paint-graphite',
    name: 'Краска «Графит»',
    kind: 'Краска',
    pattern: 'paint',
    repeatMm: 1000,
    colour: [86, 90, 96],
    roughness: 0.94,
  },
  {
    code: 'wall-paper-stripe-beige',
    name: 'Обои «Полоса бежевая»',
    kind: 'Обои',
    pattern: 'stripe',
    repeatMm: 530,
    stripeMm: 66,
    colour: [224, 213, 195],
    roughness: 0.9,
  },
  {
    code: 'wall-paper-stripe-blue',
    name: 'Обои «Полоса синяя»',
    kind: 'Обои',
    pattern: 'stripe',
    repeatMm: 530,
    stripeMm: 66,
    colour: [168, 186, 202],
    roughness: 0.9,
  },
  {
    code: 'wall-paper-linen-warm',
    name: 'Обои «Рогожка тёплая»',
    kind: 'Обои',
    pattern: 'linen',
    repeatMm: 320,
    threadMm: 5,
    colour: [219, 208, 190],
    roughness: 0.93,
  },
  {
    code: 'wall-paper-linen-grey',
    name: 'Обои «Рогожка серая»',
    kind: 'Обои',
    pattern: 'linen',
    repeatMm: 320,
    threadMm: 5,
    colour: [196, 196, 192],
    roughness: 0.93,
  },
  {
    code: 'wall-plaster-sand',
    name: 'Штукатурка «Песок»',
    kind: 'Декоративная штукатурка',
    pattern: 'plaster',
    repeatMm: 900,
    colour: [214, 199, 176],
    roughness: 0.88,
  },
  {
    code: 'wall-plaster-grey',
    name: 'Штукатурка «Серая»',
    kind: 'Декоративная штукатурка',
    pattern: 'plaster',
    repeatMm: 900,
    colour: [190, 188, 184],
    roughness: 0.88,
  },
];
