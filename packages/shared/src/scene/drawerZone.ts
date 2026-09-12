import type { Placement } from './schema';
import { boxAxes, type Box } from './collision';

/**
 * Место, которое занимает выдвинутый ящик.
 *
 * Ящик уезжает вперёд на длину направляющей, и всё, что стоит перед
 * фасадом, его останавливает. Планировщик, который об этом молчит,
 * выдаёт кухню, где тумбу нельзя открыть — а узнаётся это уже на
 * монтаже.
 *
 * Зона считается прямоугольником перед фасадом, а не по каждому ящику
 * отдельно: ящики одного модуля выезжают в одну и ту же сторону на одну
 * и ту же длину, и разбиение по ящикам дало бы тот же ответ дороже.
 */

/** Изделие, у которого есть выдвижные ящики. */
export interface DrawerSpec {
  widthMm: number;
  depthMm: number;
  heightMm: number;
  drawerCount: number;
  /** Ход направляющей. 0 — ящиков нет или ход не записан */
  drawerTravelMm: number;
}

export function hasDrawers(spec: Pick<DrawerSpec, 'drawerCount' | 'drawerTravelMm'>): boolean {
  return spec.drawerCount > 0 && spec.drawerTravelMm > 0;
}

/**
 * Габарит зоны выдвижения перед изделием.
 *
 * Фасад смотрит вдоль локальной +Z модели — туда же уезжают ящики
 * (см. DrawerController во вьюере). Возвращает null, если выдвигать
 * нечему.
 */
export function drawerZone(
  placement: Pick<Placement, 'position' | 'rotationY'>,
  spec: DrawerSpec,
): Box | null {
  if (!hasDrawers(spec)) return null;

  const { forward } = boxAxes({ rotationDeg: placement.rotationY });
  const reach = spec.depthMm / 2 + spec.drawerTravelMm / 2;

  return {
    centre: {
      x: placement.position.x + forward.x * reach,
      y: placement.position.z + forward.y * reach,
    },
    halfWidthMm: spec.widthMm / 2,
    halfDepthMm: spec.drawerTravelMm / 2,
    rotationDeg: placement.rotationY,
    bottomMm: placement.position.y,
    topMm: placement.position.y + spec.heightMm,
  };
}
