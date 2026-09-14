import { describe, expect, it } from 'vitest';
import { arHref, arPlatform, glbUrlOf } from './ar';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15';

const target = {
  name: 'Мойка врезная 500',
  usdzUrl: '/assets/test/SINK/model.usdz',
  glbUrl: '/assets/test/SINK/lod0.glb',
};

describe('определение платформы', () => {
  it('айфон открывает Quick Look', () => {
    expect(arPlatform(IPHONE)).toBe('ios');
  });

  it('андроид открывает Scene Viewer', () => {
    expect(arPlatform(ANDROID)).toBe('android');
  });

  it('настольный браузер AR не умеет', () => {
    expect(arPlatform(MAC)).toBe('none');
  });
});

describe('ссылка в AR', () => {
  it('на iOS ведёт прямо на USDZ абсолютным адресом', () => {
    // Quick Look на относительном пути из встроенного виджета теряется
    expect(arHref(target, 'ios', 'https://shop.example')).toBe(
      'https://shop.example/assets/test/SINK/model.usdz',
    );
  });

  it('без USDZ на iOS открывать нечем', () => {
    expect(arHref({ ...target, usdzUrl: undefined }, 'ios', 'https://shop.example')).toBeNull();
  });

  it('на Android собирается intent на Scene Viewer', () => {
    const href = arHref(target, 'android', 'https://shop.example')!;

    expect(href.startsWith('intent://arvr.google.com/scene-viewer/1.0')).toBe(true);
    expect(href).toContain(encodeURIComponent('https://shop.example/assets/test/SINK/lod0.glb'));
    // Без package и action Scene Viewer молча не открывается
    expect(href).toContain('package=com.google.android.googlequicksearchbox');
    expect(href).toContain('action=android.intent.action.VIEW');
    expect(href).toContain('S.browser_fallback_url=');
    expect(href.endsWith('end;')).toBe(true);
  });

  it('на Android USDZ не нужен: хватает того же GLB, что и сцене', () => {
    expect(arHref({ ...target, usdzUrl: undefined }, 'android', 'https://s.io')).not.toBeNull();
  });

  it('на настольном браузере ссылки нет', () => {
    expect(arHref(target, 'none')).toBeNull();
  });
});

describe('адрес модели', () => {
  it('нулевой LOD подставляется в шаблон каталога', () => {
    expect(glbUrlOf('/assets/test/SINK/lod{lod}.glb')).toBe('/assets/test/SINK/lod0.glb');
  });
});
