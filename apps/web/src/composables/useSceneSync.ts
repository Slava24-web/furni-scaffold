import { markRaw, onBeforeUnmount, shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import { RoomBuilder, applyFinishes, type CutoutRect, type Viewer } from '@furni/viewer';
import {
  drawerZone,
  placementProductSize,
  planDimensions,
  selectedFinish,
  sizeFactors,
  swingZones,
  type CatalogProduct,
  type Placement,
  type SceneDoc,
} from '@furni/shared';

/**
 * Насколько вырез уже габарита врезанного изделия.
 *
 * Бортику мойки надо на что-то лечь: окно всегда меньше её габарита
 * по периметру, иначе изделие провалится в тумбу.
 */
const CUTOUT_LEDGE_MM = 22;
import type { MeshStandardMaterial, Object3D } from 'three';
import type { Box } from '@furni/shared';
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
export function useSceneSync(
  viewer: ShallowRef<Viewer | null>,
  selectedId?: Ref<string | null>,
): {
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

  /**
   * Зона выдвижения показывается только у выделенного объекта: ряд кухни
   * из пяти тумб залил бы прямоугольниками весь пол.
   */
  function selectedPullouts(doc: SceneDoc, instanceId: string | null): Box[] {
    const placement = doc.placements.find((item) => item.instanceId === instanceId);
    const product = placement && catalog.bySku.get(placement.sku);
    const zone = placement && product ? drawerZone(placement, product) : null;
    return zone ? [zone] : [];
  }

  function syncRooms(v: Viewer, doc: SceneDoc): void {
    const room = builder(v);
    // Покрытие ставится до сборки: иначе пол успевает мелькнуть серым
    const floorCode = doc.rooms[0]?.floorMaterialId;
    room.setFloorFinish(floorCode ? (v.materials.surface(floorCode) ?? null) : null);

    const wallCode = doc.rooms[0]?.wallMaterialId;
    room.setWallFinish(wallCode ? (v.materials.surface(wallCode) ?? null) : null);
    room.build(doc.rooms);
    // Размерные линии пересобираются вместе со стенами: подпись обязана
    // показывать текущий размер, а не тот, что был до правки
    v.dimensions.build(doc.rooms.flatMap((item) => planDimensions(item)));
    // Зоны открывания дверей: пользователь должен видеть, куда нельзя
    // ставить мебель, а не узнавать об этом из сообщения о конфликте
    v.swings.build(
      doc.rooms.flatMap((item) => swingZones(item)),
      selectedPullouts(doc, selectedId?.value ?? null),
    );
    // Двери и окна строятся после материалов тенанта: цвет изделия —
    // та же отделка, что у мебели
    v.openings.build(doc.rooms, v.materials);
    // Инженерия: розетку и вывод воды не видно на модели, а расставлять
    // мебель без них — это переделка на монтаже
    v.services.build(doc.services);
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
        if (product) applyScale(existing.root, placement, product);
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
      applyScale(group, placement, product);
      applyFinish(v, group, product, placement);
      v.registry.add(placement.instanceId, placement.sku, group).locked = placement.locked;
    }

    if (token === generation) {
      cutWorktops(v, doc);
      v.invalidate();
    }
  }

  /**
   * Вырез в столешницах под врезные изделия.
   *
   * Считается после расстановки: где стоит мойка, знает только сцена.
   * Окно берётся по габариту изделия с припуском внутрь — вырез всегда
   * чуть меньше бортика, иначе мойке не на что опереться.
   */
  function cutWorktops(v: Viewer, doc: SceneDoc): void {
    const tops: { instanceId: string; placement: Placement; product: CatalogProduct }[] = [];
    const recessed: { placement: Placement; product: CatalogProduct }[] = [];

    for (const placement of doc.placements) {
      const product = catalog.bySku.get(placement.sku);
      if (!product) continue;
      if (product.role === 'worktop') tops.push({ instanceId: placement.instanceId, placement, product });
      else if ((product.recessMm ?? 0) > 0) recessed.push({ placement, product });
    }

    for (const top of tops) {
      const instance = v.registry.get(top.instanceId);
      if (!instance) continue;
      if (v.worktops.cut(instance.root, holesIn(top.placement, top.product, recessed))) {
        v.invalidate();
      }
    }
  }

  /** Окна в системе координат столешницы, миллиметры. */
  function holesIn(
    top: Placement,
    topProduct: CatalogProduct,
    recessed: readonly { placement: Placement; product: CatalogProduct }[],
  ): CutoutRect[] {
    const size = placementProductSize(top, topProduct);
    const angle = (-top.rotationY * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const holes: CutoutRect[] = [];
    for (const item of recessed) {
      const dx = item.placement.position.x - top.position.x;
      const dz = item.placement.position.z - top.position.z;
      // Поворот в систему координат столешницы
      const x = dx * cos - dz * sin;
      const y = dx * sin + dz * cos;

      // Размер окна берётся у самого изделия: у круглой мойки бортик
      // круглый, и прямоугольник «габарит минус припуск» вылез бы
      // из-под него углами. Каталог без выреза — запасной расчёт
      const itemSize = placementProductSize(item.placement, item.product);
      const declared = item.product.cutout;
      const hole = declared
        ? {
            x: x + declared.offsetXMm,
            y: y + declared.offsetZMm,
            widthMm: declared.widthMm,
            depthMm: declared.depthMm,
          }
        : {
            x,
            y,
            widthMm: Math.max(20, itemSize.widthMm - CUTOUT_LEDGE_MM * 2),
            depthMm: Math.max(20, itemSize.depthMm - CUTOUT_LEDGE_MM * 2),
          };

      // Мойка на соседней тумбе в эту плиту не врезана
      if (Math.abs(x) > size.widthMm / 2 || Math.abs(y) > size.depthMm / 2) continue;
      holes.push(hole);
    }
    return holes;
  }

  watch(
    [() => viewer.value, () => scene.doc, () => catalog.products, () => selectedId?.value],
    async ([v, doc]) => {
      if (!v) return;
      // Материалы тенанта нужны раньше объектов: по ним собирается отделка
      v.materials.register(catalog.materials);
      v.materials.registerSurfaces([...catalog.floors, ...catalog.walls]);
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
 * Заказанный размер как масштаб модели.
 *
 * Тянуть готовый GLB — компромисс: вместе с корпусом растягивается и
 * профиль ручки. Пересобирать модель на каждый миллиметр было бы честнее,
 * но она приходит из пайплайна готовой, а показать заказанный размер
 * надо сейчас. В раскрой при этом уходят ЧЕСТНЫЕ размеры деталей — там
 * масштаб считается по осям, а не по картинке.
 */
function applyScale(root: Object3D, placement: Placement, product: CatalogProduct): void {
  const factors = sizeFactors(placement, product);
  root.scale.set(factors.width, factors.height, factors.depth);
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
