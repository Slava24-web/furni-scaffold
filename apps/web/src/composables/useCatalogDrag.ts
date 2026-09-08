import { onBeforeUnmount, ref, shallowRef } from 'vue';
import type { CatalogProduct } from '@furni/shared';

/**
 * Перетаскивание товара из каталога в сцену.
 *
 * На указательных событиях, а не на HTML5 drag-and-drop: нативный DnD
 * не работает на тач-устройствах, а целевая платформа продукта — телефон
 * (ТЗ, раздел 7). Один и тот же код обслуживает мышь и палец.
 */
export function useCatalogDrag(options: {
  /** Отпускание над сценой: координаты в пикселях окна */
  onDrop: (product: CatalogProduct, clientX: number, clientY: number) => void;
  /** Попадает ли точка в область сцены */
  isOverScene: (clientX: number, clientY: number) => boolean;
}) {
  const product = shallowRef<CatalogProduct | null>(null);
  const ghostX = ref(0);
  const ghostY = ref(0);
  const overScene = ref(false);

  let pointerId: number | null = null;

  function start(item: CatalogProduct, event: PointerEvent): void {
    if (pointerId !== null) return;
    event.preventDefault();

    pointerId = event.pointerId;
    product.value = item;
    move(event);

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancel);
  }

  function move(event: PointerEvent): void {
    ghostX.value = event.clientX;
    ghostY.value = event.clientY;
    overScene.value = options.isOverScene(event.clientX, event.clientY);
  }

  function onMove(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;
    // Иначе на телефоне жест уедет в прокрутку страницы вместо переноса
    event.preventDefault();
    move(event);
  }

  function onUp(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;
    const item = product.value;
    const dropped = overScene.value;
    cleanup();
    if (item && dropped) options.onDrop(item, event.clientX, event.clientY);
  }

  function cancel(): void {
    cleanup();
  }

  function cleanup(): void {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', cancel);
    pointerId = null;
    product.value = null;
    overScene.value = false;
  }

  // Слушатели висят на window: без снятия они переживут страницу
  onBeforeUnmount(cleanup);

  return { product, ghostX, ghostY, overScene, start };
}
