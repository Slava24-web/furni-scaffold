import type { Placement } from './schema';
import type { Vec2 } from './walls';
import { TOUCH_TOLERANCE_MM, insideBox, placementBox, type Box, type ProductSize } from './box';

/**
 * Опоры и осадка сцены.
 *
 * Отвечает на один вопрос: на какой высоте объект окажется, если
 * поставить его сюда. Отдельно от проверки пересечений — постановка НА
 * другой объект законна, и путать её со столкновением нельзя.
 */

/**
 * Есть ли под точкой опора, на которой объект уже стоит.
 *
 * Габарит опоры может быть выше самой опорной поверхности: у столешницы
 * с пристенным плинтусом верх габарита на 60 мм выше плоскости, на которой
 * стоит мойка. Сравнивать высоту объекта с верхом габарита нельзя — иначе
 * такая опора считается «висящей выше» и объект роняется на предмет под ней.
 *
 * Поэтому проверяется вхождение: низ объекта лежит в вертикальном
 * диапазоне опоры.
 */
export function restsOnSomething(
  point: Vec2,
  bottomMm: number,
  supports: readonly Box[],
  toleranceMm = TOUCH_TOLERANCE_MM,
): boolean {
  return supports.some(
    (support) =>
      bottomMm >= support.bottomMm - toleranceMm &&
      bottomMm <= support.topMm + toleranceMm &&
      insideBox(support, point),
  );
}

/**
 * Верх опоры под точкой: на какой высоте окажется объект, поставленный сюда.
 *
 * Ноль означает пол. Берётся максимум, а не первое попадание: над тумбой
 * может лежать столешница, и вещь должна встать на столешницу.
 *
 * `maxTopMm` ограничивает поиск сверху. Осадка сцены передаёт туда текущую
 * высоту объекта: вещь может опуститься, когда из-под неё убрали опору,
 * но не должна сама запрыгнуть на то, что оказалось рядом выше — иначе
 * осадка отменяла бы точную постановку пользователя.
 */
export function supportTopMm(
  point: Vec2,
  supports: readonly Box[],
  maxTopMm = Infinity,
): number {
  let top = 0;
  for (const support of supports) {
    if (support.topMm > maxTopMm) continue;
    if (!insideBox(support, point)) continue;
    top = Math.max(top, support.topMm);
  }
  return top;
}

/**
 * Высота установки объекта с учётом опоры под ним.
 *
 * Берётся максимум из собственной высоты установки и верха опоры: навесной
 * шкаф остаётся на своей отметке над тумбой, а вещь с нулевой отметкой
 * поднимается на неё.
 */
export function restingHeightMm(mountHeightMm: number, supportTop: number): number {
  return Math.max(mountHeightMm, supportTop);
}

export interface SettleItem {
  instanceId: string;
  placement: Pick<Placement, 'position' | 'rotationY'>;
  size: ProductSize;
  /** Собственная отметка товара из каталога */
  mountHeightMm: number;
  /** Может ли объект стоять на других объектах */
  stackable: boolean;
}

export interface SettleChange {
  instanceId: string;
  yMm: number;
}

/**
 * Осадка сцены: приведение высот к тому, что реально стоит под объектами.
 *
 * Нужна после любого изменения документа. Убрали столешницу — вещи на ней
 * обязаны опуститься, а не остаться висеть в воздухе; вернули отменой —
 * подняться обратно. Без этого документ рассогласуется с физикой сцены
 * при первом же удалении опоры.
 *
 * Объекты обрабатываются снизу вверх, и опорой считается только уже
 * осевший объект. Так порядок детерминирован, а взаимные опоры двух
 * объектов на одном уровне не зацикливаются.
 *
 * Осадка умеет только опускать. Поднять объект может лишь сам
 * пользователь, целясь в поверхность: иначе она перечёркивала бы точную
 * постановку, забрасывая вещь на первый попавшийся объект выше.
 *
 * Возвращаются только изменившиеся высоты: вызывающий код по пустому
 * результату понимает, что переписывать документ не нужно.
 */
export function settlePlacements(items: readonly SettleItem[]): SettleChange[] {
  const ordered = [...items].sort((a, b) => a.placement.position.y - b.placement.position.y);
  const settled: Box[] = [];
  const changes: SettleChange[] = [];

  for (const item of ordered) {
    const centre = { x: item.placement.position.x, y: item.placement.position.z };
    const yMm = item.stackable
      ? settledHeight(item, centre, settled)
      : item.mountHeightMm;

    if (yMm !== item.placement.position.y) {
      changes.push({ instanceId: item.instanceId, yMm });
    }

    settled.push(
      placementBox({ position: { ...item.placement.position, y: yMm }, rotationY: item.placement.rotationY }, item.size),
    );
  }

  return changes;
}

/**
 * Высота объекта после осадки.
 *
 * Пока под объектом что-то есть, он остаётся на месте: точную постановку
 * пользователя осадка не трогает. Опора исчезла — объект опускается на
 * ближайшую, что ниже, но никогда не поднимается сам.
 */
function settledHeight(
  item: SettleItem,
  centre: Vec2,
  settled: readonly Box[],
): number {
  const current = item.placement.position.y;
  if (restsOnSomething(centre, current, settled)) return current;
  return restingHeightMm(item.mountHeightMm, supportTopMm(centre, settled, current));
}
