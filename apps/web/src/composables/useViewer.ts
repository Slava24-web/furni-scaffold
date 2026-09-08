import { markRaw, onBeforeUnmount, shallowRef, type Ref, type ShallowRef } from 'vue';
import { Viewer, type TelemetrySnapshot } from '@furni/viewer';

/**
 * Монтирование 3D-ядра в компонент Vue.
 *
 * КРИТИЧНО: viewer оборачивается в markRaw и хранится в shallowRef.
 * Без этого Vue навесит Proxy на Object3D, и каждое обращение к
 * .position.x в цикле рендера пойдёт через перехватчик — падение
 * производительности на порядок (CLAUDE.md, правило 1).
 */
export function useViewer(canvasRef: Ref<HTMLCanvasElement | null>): {
  viewer: ShallowRef<Viewer | null>;
  telemetry: ShallowRef<TelemetrySnapshot | null>;
  mount: () => void;
} {
  const viewer = shallowRef<Viewer | null>(null);
  const telemetry = shallowRef<TelemetrySnapshot | null>(null);

  function mount(): void {
    const canvas = canvasRef.value;
    if (!canvas || viewer.value) return;

    viewer.value = markRaw(
      new Viewer({
        canvas,
        onTelemetry: (snapshot) => {
          // Раз в 5 секунд — не на кадр. Обновление UI отсюда безопасно.
          telemetry.value = snapshot;
          void reportTelemetry(snapshot);
        },
      }),
    );
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
