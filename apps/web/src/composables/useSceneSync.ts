import { markRaw, onBeforeUnmount, shallowRef, watch, type ShallowRef } from 'vue';
import { RoomBuilder, applyFinishes, type Viewer } from '@furni/viewer';
import {
  planDimensions,
  selectedFinish,
  swingZones,
  type CatalogProduct,
  type Placement,
  type SceneDoc,
} from '@furni/shared';
import type { MeshStandardMaterial, Object3D } from 'three';
import { useCatalogStore } from '../stores/catalog';
import { useSceneStore } from '../stores/scene';

/**
 * Проекция документа сцены во вьюер.
 *
 * Направление одно: документ -> сцена. Обратное движение бывает только
 * в момент фиксации жеста, и оно записывает те же значения, что уже стоят
 * в Three.js, поэтому пересборка после коммита ничего не двигает.
 *
 * Сверка идёт по instanceId, а не пересозданием сцены: полная перезагрузка
 * моделей на каждое изменение документа означала бы фриз на каждый шаг
 * отмены.
 */
export function useSceneSync(viewer: ShallowRef<Viewer | null>): {
  ready: ShallowRef<boolean>;
} {
  const scene = useSceneStore();
  const catalog = useCatalogStore();
  const ready = shallowRef(false);
  const rooms = shallowRef<RoomBuilder | null>(null);

  /** Токен гонки: пока грузится модель, документ мог смениться снова. */
  let generation = 0;
  let stopCulling: (() => void) | null = null;

  function builder(v: Viewer): RoomBuilder {
    if (!rooms.value) {
      rooms.value = markRaw(new RoomBuilder(v.scene));
      // Отсечение считается каждый кадр: стены дёшевы, а привязать его
      // к движению камеры нельзя — она двигается и жестами, и колесом,
      // и программным кадрированием
      stopCulling = v.onUpdate(() => {
        if (rooms.value?.updateCulling(v.camera.position)) v.invalidate();
      });
    }
    return rooms.value;
  }

  function syncRooms(v: Viewer, doc: SceneDoc): void {
    const room = builder(v);
    room.build(doc.rooms);
    // Размерные линии пересобираются вместе со стенами: подпись обязана
    // показывать текущий размер, а не тот, что был до правки
    v.dimensions.build(doc.rooms.flatMap((item) => planDimensions(item)));
    // Зоны открывания дверей: пользователь должен видеть, куда нельзя
    // ставить мебель, а не узнавать об этом из сообщения о конфликте
    v.swings.build(doc.rooms.flatMap((item) => swingZones(item)));
    // Двери и окна строятся после материалов тенанта: цвет изделия —
    // та же отделка, что у мебели
    v.openings.build(doc.rooms, v.materials);
    // Опорная сетка нужна на пустой сцене; в готовом помещении она
    // только спорит с полом
    v.environment.setGridVisible(room.isEmpty);
    v.invalidate();
  }

  async function syncPlacements(v: Viewer, doc: SceneDoc): Promise<void> {
    const token = ++generation;
    const wanted = new Map(doc.placements.map((p) => [p.instanceId, p]));

    for (const instance of [...v.registry.all()]) {
      if (!wanted.has(instance.instanceId)) v.registry.remove(instance.instanceId);
    }

    for (const placement of wanted.values()) {
      const product = catalog.bySku.get(placement.sku);
      const existing = v.registry.get(placement.instanceId);
      if (existing) {
        applyTransform(existing.root, placement);
        if (product) applyFinish(v, existing.root, product, placement);
        // Закрепление живёт в документе, а проверяют его жесты по реестру
        existing.locked = placement.locked;
        continue;
      }

      if (!product) continue; // товар исчез из каталога — молча пропускаем

      const group = await v.assets.load(
        { productId: product.sku, urlTemplate: product.urlTemplate },
        0,
      );
      // Пока грузилось, документ мог смениться: результат уже не нужен
      if (token !== generation || v.registry.get(placement.instanceId)) continue;

      applyTransform(group, placement);
      applyFinish(v, group, product, placement);
      v.registry.add(placement.instanceId, placement.sku, group).locked = placement.locked;
    }

    if (token === generation) v.invalidate();
  }

  watch(
    [() => viewer.value, () => scene.doc, () => catalog.products],
    async ([v, doc]) => {
      if (!v) return;
      // Материалы тенанта нужны раньше объектов: по ним собирается отделка
      v.materials.register(catalog.materials);
      syncRooms(v, doc);
      await syncPlacements(v, doc);
      ready.value = true;
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    stopCulling?.();
    stopCulling = null;
    rooms.value?.dispose();
    rooms.value = null;
  });

  return { ready };
}

function applyTransform(root: { position: { set(x: number, y: number, z: number): void }; rotation: { y: number } }, placement: Placement): void {
  root.position.set(placement.position.x / 1000, placement.position.y / 1000, placement.position.z / 1000);
  root.rotation.y = (placement.rotationY * Math.PI) / 180;
}

/**
 * Отделка размещения.
 *
 * Выбор по умолчанию не подменяет материал: исходный запечён в модель
 * вместе со своей текстурой, и собранный на клиенте двойник выглядел бы
 * иначе там, где карта в GLB сжата иначе.
 */
function applyFinish(
  viewer: Viewer,
  root: Object3D,
  product: CatalogProduct,
  placement: Placement,
): void {
  if (product.finishes.length === 0) return;

  const slots: Record<string, MeshStandardMaterial | undefined> = {};
  for (const slot of product.finishes) {
    const code = selectedFinish(slot.code, slot, placement.options);
    slots[slot.slotMaterial] = code === slot.slotMaterial ? undefined : viewer.materials.get(code);
  }

  applyFinishes(root, slots);
}
