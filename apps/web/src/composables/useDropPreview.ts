import { shallowRef, type ShallowRef } from 'vue';
import type { Viewer } from '@furni/viewer';
import {
  EMPTY_CONFLICTS,
  drawerZone,
  hasConflicts,
  type Box,
  type CatalogProduct,
  type ConflictReport,
} from '@furni/shared';
import type { ConflictEnvironment } from './useSceneConflicts';

/** Куда встанет переносимый товар. */
export interface DropPoint {
  x: number;
  y: number;
  z: number;
  rotationY: number;
}

export interface DropPreviewDeps {
  /** Расчёт точки постановки: та же привязка, что и у перетаскивания. */
  place: (product: CatalogProduct, clientX: number, clientY: number) => DropPoint | null;
  /** Окружение сцены целиком: переносимого товара в документе ещё нет. */
  environment: () => ConflictEnvironment;
  /** Проверка конфликтов без записи в состояние выделения. */
  probe: (subject: Box, env: ConflictEnvironment, ownDrawerZone: Box | null) => ConflictReport;
  /** Подсветка виновников столкновения. */
  highlight: (instanceIds: readonly string[]) => void;
}

/**
 * Призрак товара, переносимого из каталога.
 *
 * Точка отпускания и место постановки различаются: работают привязка
 * к стене, стыковка с соседом и высота установки. Без призрака перенос
 * получается вслепую.
 */
export function useDropPreview(viewer: ShallowRef<Viewer | null>, deps: DropPreviewDeps) {
  const preview = shallowRef<{
    xMm: number;
    yMm: number;
    zMm: number;
    rotationDeg: number;
  } | null>(null);
  const previewConflicts = shallowRef<ConflictReport>(EMPTY_CONFLICTS);

  let previewSku: string | null = null;
  let previewRef: { productId: string; urlTemplate: string } | null = null;

  async function update(product: CatalogProduct, clientX: number, clientY: number): Promise<void> {
    const v = viewer.value;
    if (!v) return;

    const point = deps.place(product, clientX, clientY);
    if (!point) {
      hide();
      return;
    }

    if (!(await ensureModel(v, product))) return;

    v.preview.setTransform(point.x, point.y, point.z, point.rotationY);
    preview.value = {
      xMm: Math.round(point.x),
      yMm: Math.round(point.y),
      zMm: Math.round(point.z),
      rotationDeg: Math.round(point.rotationY),
    };

    const box: Box = {
      centre: { x: point.x, y: point.z },
      halfWidthMm: product.widthMm / 2,
      halfDepthMm: product.depthMm / 2,
      rotationDeg: point.rotationY,
      bottomMm: point.y,
      topMm: point.y + product.heightMm,
    };
    previewConflicts.value = deps.probe(
      box,
      deps.environment(),
      drawerZone(
        { position: { x: point.x, y: point.y, z: point.z }, rotationY: point.rotationY },
        product,
      ),
    );
    v.preview.setConflict(hasConflicts(previewConflicts.value));
    // Виновник подсвечивается и до отпускания: пользователь видит, во что
    // упрётся объект, ещё на подлёте
    deps.highlight(previewConflicts.value.objectIds);
    v.invalidate();
  }

  /**
   * Модель призрака грузится только при смене товара.
   * false — пока грузили, пользователь схватил другой товар.
   */
  async function ensureModel(v: Viewer, product: CatalogProduct): Promise<boolean> {
    if (previewSku === product.sku) return true;

    previewSku = product.sku;
    const ref = { productId: product.sku, urlTemplate: product.urlTemplate };
    // Превью грузится в самом лёгком LOD: оно живёт доли секунды,
    // а полная модель на слабом устройстве не успеет появиться
    const group = await v.assets.load(ref, 2);
    if (previewSku !== product.sku) return false;

    releaseAsset();
    previewRef = ref;
    v.preview.show(group);
    return true;
  }

  function hide(): void {
    const v = viewer.value;
    v?.preview.hide();
    v?.conflicts.clear();
    releaseAsset();
    previewSku = null;
    preview.value = null;
    previewConflicts.value = EMPTY_CONFLICTS;
    v?.invalidate();
  }

  /** Счётчик ссылок загрузчика: без возврата модель никогда не вытеснится. */
  function releaseAsset(): void {
    if (previewRef) viewer.value?.assets.release(previewRef, 2);
    previewRef = null;
  }

  return { preview, previewConflicts, update, hide };
}
