/**
 * Точка входа в дополненную реальность.
 *
 * Единого способа показать AR в вебе на обеих платформах нет. Safari
 * не даёт WebXR для дополненной реальности на айфоне, и обе платформы
 * отдают этот сценарий родному просмотрщику — по обычной ссылке.
 * Поэтому здесь нет ни WebXR, ни библиотеки на двести килобайт:
 * только вычисление адреса. Разбор целиком — docs/AR.md.
 */

export type ArPlatform = 'ios' | 'android' | 'none';

/**
 * Какой просмотрщик доступен устройству.
 *
 * Разбор строки агента — способ так себе, но выбора нет: ни у Quick Look,
 * ни у Scene Viewer нет признака в API. Ошибка не страшна: ссылка просто
 * не откроется, поэтому на настольном браузере мы её и не показываем.
 */
export function arPlatform(userAgent: string = navigator.userAgent): ArPlatform {
  // iPadOS с 13 версии представляется Маком, и отличить его можно
  // только по наличию тач-ввода
  const iPadOS = /Macintosh/.test(userAgent) && typeof navigator !== 'undefined'
    && navigator.maxTouchPoints > 1;

  if (/iPhone|iPad|iPod/.test(userAgent) || iPadOS) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  return 'none';
}

export interface ArTarget {
  name: string;
  /** Адрес USDZ для iOS; пусто — изделие в AR не выпущено */
  usdzUrl?: string | undefined;
  /** Адрес GLB нулевого LOD для Android */
  glbUrl: string;
}

/**
 * Ссылка, открывающая AR на этом устройстве. null — открывать нечем.
 *
 * Адреса делаются абсолютными: Scene Viewer принимает только полный URL,
 * а Quick Look на относительном пути из встроенного виджета теряется.
 */
export function arHref(
  target: ArTarget,
  platform: ArPlatform,
  // Источник передаётся параметром: функция обязана считаться и вне
  // браузера, иначе её не проверить
  origin: string = typeof location === 'undefined' ? 'http://localhost' : location.origin,
): string | null {
  if (platform === 'none') return null;

  if (platform === 'ios') {
    return target.usdzUrl ? new URL(target.usdzUrl, origin).href : null;
  }

  if (platform === 'android') {
    const file = new URL(target.glbUrl, origin).href;
    const fallback = new URL(target.glbUrl, origin).href;
    // Формат намеренно точный: Scene Viewer молча не открывается,
    // если потерять package или action
    return (
      `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(file)}` +
      `&mode=ar_preferred&title=${encodeURIComponent(target.name)}` +
      `#Intent;scheme=https;package=com.google.android.googlequicksearchbox;` +
      `action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(fallback)};end;`
    );
  }

  return null;
}

/** Адрес модели нулевого LOD из шаблона каталога. */
export const glbUrlOf = (urlTemplate: string): string => urlTemplate.replace('{lod}', '0');
