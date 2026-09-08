import type { DeviceTier } from '@furni/shared';

/**
 * Определение класса устройства. Синхронная эвристика на старте;
 * дальше QualityManager корректирует по реальному fps.
 * Полагаться только на UA нельзя, только на бенчмарк — долго. Комбинируем.
 */
export function detectTier(renderer: { getContext(): WebGLRenderingContext }): DeviceTier {
  const gl = renderer.getContext();
  const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  // deviceMemory есть не везде; отсутствие трактуем консервативно
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? (isTouch ? 4 : 8);

  let gpu = '';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (ext) {
    gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '').toLowerCase();
  }

  const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

  if (!isTouch) {
    return cores >= 8 && memory >= 8 ? 'desktop' : 'high';
  }

  // Apple: A14+ и M-серия уверенно держат high
  if (/apple\s*(a1[4-9]|a2\d|m[1-9])/.test(gpu)) return 'high';
  // Заведомо слабые мобильные GPU
  if (/adreno\s*(5\d\d|6[0-1]\d)|mali-g5[0-2]|powervr\s*ge/.test(gpu)) return 'low';
  if (maxTexture < 8192 || cores <= 4 || memory <= 3) return 'low';
  if (/adreno\s*7\d\d|mali-g7\d|apple/.test(gpu) && memory >= 6) return 'high';

  return 'mid';
}
