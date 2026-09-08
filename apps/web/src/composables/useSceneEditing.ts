import { markRaw, ref, shallowRef, type ShallowRef } from 'vue';
import { Vector2 } from 'three';
import {
  DEFAULT_SNAP,
  GestureController,
  SnapEngine,
  type GestureEvent,
  type Viewer,
} from '@furni/viewer';
import type { Placement } from '@furni/shared';

/**
 * Связка жестов, снаппинга и состояния редактирования.
 *
 * ПРАВИЛО 3 из CLAUDE.md: во время перетаскивания позиция в Pinia НЕ пишется.
 * Объект двигается напрямую в Three.js, стор обновляется один раз на dragEnd.
 */
export function useSceneEditing(viewer: ShallowRef<Viewer | null>, options: {
  onCommit: (instanceId: string, placement: Partial<Placement>) => void;
}) {
  const selectedId = ref<string | null>(null);
  const isSnapping = ref(false);
  const snapEngine = shallowRef(markRaw(new SnapEngine()));
  let gestures: GestureController | null = null;

  function attach(element: HTMLElement): void {
    gestures = markRaw(
      new GestureController(element, {
        onGesture: handleGesture,
        isOnSelection: (point) => hitTestSelection(point),
        haptic: (pattern) => navigator.vibrate?.(pattern),
      }),
    );
  }

  function hitTestSelection(point: Vector2): boolean {
    if (!selectedId.value || !viewer.value) return false;
    // TODO: raycast по габариту выделенного объекта.
    // Порог попадания расширить до 56px — требование ТЗ 8.2 для 3D-хэндлов.
    void point;
    return false;
  }

  function handleGesture(e: GestureEvent): void {
    const v = viewer.value;
    if (!v) return;

    switch (e.type) {
      case 'tap':
        // TODO: raycast -> registry.resolve -> selectedId
        break;

      case 'dragMove':
        if (e.onSelection && selectedId.value) {
          moveSelected(e.point);
        } else {
          orbitCamera(e.delta);
        }
        v.invalidate();
        break;

      case 'dragEnd':
        if (e.onSelection && selectedId.value) {
          commitSelectedPosition();
        }
        isSnapping.value = false;
        break;

      case 'pinch':
        zoomCamera(e.scale);
        v.invalidate();
        break;

      case 'twoFingerPan':
        panCamera(e.delta);
        v.invalidate();
        break;
    }
  }

  function moveSelected(screenPoint: Vector2): void {
    const v = viewer.value;
    if (!v || !selectedId.value) return;
    const instance = v.registry.get(selectedId.value);
    if (!instance || instance.locked) return;

    // TODO: проекция экранной точки на пол через raycast
    const desired = new Vector2(screenPoint.x, screenPoint.y);

    const result = snapEngine.value.snap(desired, {
      ...DEFAULT_SNAP,
      mmPerPixel: currentMmPerPixel(),
    });

    if (result.snapped && !isSnapping.value) {
      navigator.vibrate?.(8); // тактильный отклик на привязку (ТЗ 8.2)
    }
    isSnapping.value = result.snapped;

    // Прямая мутация Three.js. В Pinia НЕ пишем — это горячий путь.
    instance.root.position.set(result.position.x / 1000, 0, result.position.y / 1000);
    if (result.rotation !== null) {
      instance.root.rotation.y = (result.rotation * Math.PI) / 180;
    }
  }

  function commitSelectedPosition(): void {
    const v = viewer.value;
    if (!v || !selectedId.value) return;
    const instance = v.registry.get(selectedId.value);
    if (!instance) return;

    // Единственная запись в стор за весь жест
    options.onCommit(selectedId.value, {
      position: {
        x: Math.round(instance.root.position.x * 1000),
        y: Math.round(instance.root.position.y * 1000),
        z: Math.round(instance.root.position.z * 1000),
      },
      rotationY: Math.round((instance.root.rotation.y * 180) / Math.PI),
    });
  }

  function currentMmPerPixel(): number {
    // TODO: вычислять из ортокамеры для 2D и из перспективы для 3D
    return 10;
  }

  function orbitCamera(_delta: Vector2): void { /* TODO */ }
  function panCamera(_delta: Vector2): void { /* TODO */ }
  function zoomCamera(_scale: number): void { /* TODO */ }

  function detach(): void {
    gestures?.dispose();
    gestures = null;
  }

  return { selectedId, isSnapping, attach, detach };
}
