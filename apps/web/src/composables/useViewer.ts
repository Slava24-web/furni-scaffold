import { markRaw, onBeforeUnmount, shallowRef, type Ref, type ShallowRef } from 'vue';
import { Viewer, type TelemetrySnapshot, type ViewerOptions } from '@furni/viewer';
import type { DeviceTier } from '@furni/shared';

/**
 * Монтирование 3D-ядра в компонент Vue.
 *
 * КРИТИЧНО: viewer оборачивается в markRaw и хранится в shallowRef.
 * Без этого Vue навесит Proxy на Object3D, и каждое обращение к
 * .position.x в цикле рендера пойдёт через перехватчик — падение
 * производительности на порядок (CLAUDE.md, правило 1).
 */
export function useViewer(
  canvasRef: Ref<HTMLCanvasElement | null>,
  options: { forceTier?: DeviceTier } = {},
): {
  viewer: ShallowRef<Viewer | null>;
  telemetry: ShallowRef<TelemetrySnapshot | null>;
  mount: () => void;
} {
  const viewer = shallowRef<Viewer | null>(null);
  const telemetry = shallowRef<TelemetrySnapshot | null>(null);

  function mount(): void {
    const canvas = canvasRef.value;
    if (!canvas || viewer.value) return;

    const viewerOptions: ViewerOptions = {
      canvas,
      onTelemetry: (snapshot) => {
        // Раз в 5 секунд — не на кадр. Обновление UI отсюда безопасно.
        telemetry.value = snapshot;
        void reportTelemetry(snapshot);
      },
    };
    // Присваиваем только при наличии: exactOptionalPropertyTypes
    // не разрешает передать forceTier: undefined
    if (options.forceTier) viewerOptions.forceTier = options.forceTier;

    viewer.value = markRaw(new Viewer(viewerOptions));
    viewer.value.start();
  }

  onBeforeUnmount(() => {
    viewer.value?.dispose();
    viewer.value = null;
  });

  return { viewer, telemetry, mount };
}

async function reportTelemetry(snapshot: TelemetrySnapshot): Promise<void> {
  // sendBeacon не блокирует выгрузку страницы и не мешает кадру
  if (typeof navigator.sendBeacon !== 'function') return;
  navigator.sendBeacon('/v1/telemetry', JSON.stringify(snapshot));
}
