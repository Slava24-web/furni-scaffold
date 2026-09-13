import type { Object3D, Vector2 } from 'three';

/**
 * Кому адресован одиночный тап по сцене.
 *
 * Порядок разбора — это правило интерфейса, а не деталь обработчика
 * жестов, поэтому он живёт отдельно и покрыт тестами: перепутанный
 * порядок означает, что подпись размера перестаёт нажиматься, а тап
 * по двери выделяет тумбу рядом с ней.
 */

/** То немногое от вьюера, что нужно для разбора тапа. */
export interface TapProbe {
  pickService(ndc: Vector2): string | null;
  pickDimension(ndc: Vector2): { id: string; lengthMm: number } | null;
  pickOpening(ndc: Vector2): string | null;
  pick(ndc: Vector2): { instanceId: string; root: Object3D } | null;
  pickDrawer(ndc: Vector2, root: Object3D): Object3D | null;
  pickDoor(ndc: Vector2, root: Object3D): Object3D | null;
}

export type TapAction =
  | { kind: 'service'; serviceId: string }
  /** Режим планировки: тап адресован полу, а не объектам */
  | { kind: 'floor' }
  | { kind: 'dimension'; dimension: { id: string; lengthMm: number } }
  | { kind: 'opening'; openingId: string }
  | { kind: 'drawer'; node: Object3D }
  | { kind: 'door'; node: Object3D }
  | { kind: 'select'; instanceId: string | null };

export interface TapContext {
  /** Планировщик не в режиме выделения: рисуем стену или ставим проём. */
  planning: boolean;
  selectedId: string | null;
}

export function routeTap(probe: TapProbe, ndc: Vector2, context: TapContext): TapAction {
  // Метка инженерии проверяется первой: она мелкая, лежит на стене
  // и на полу, и попасть по ней иначе невозможно
  const service = probe.pickService(ndc);
  if (service) return { kind: 'service', serviceId: service };

  // В режимах планировки тап адресован полу: иначе рисование стены
  // выделяло бы мебель под курсором
  if (context.planning) return { kind: 'floor' };

  // Размер проверяется раньше объектов: плашка нарисована поверх
  // мебели, и тап по видимой подписи должен попадать в неё
  const dimension = probe.pickDimension(ndc);
  if (dimension) return { kind: 'dimension', dimension };

  // Дверь и окно выбираются раньше мебели: они нарисованы в плоскости
  // стены, и мебель у стены иначе перехватывала бы тап
  const opening = probe.pickOpening(ndc);
  if (opening) return { kind: 'opening', openingId: opening };

  const hit = probe.pick(ndc);
  // Ящик выдвигается тапом по УЖЕ выделенному изделию: первый тап
  // выбирает объект, и открывать ящик заодно с выбором нельзя —
  // пользователь ещё не показал, что хочет заглянуть внутрь
  if (hit && hit.instanceId === context.selectedId) {
    const drawer = probe.pickDrawer(ndc, hit.root);
    if (drawer) return { kind: 'drawer', node: drawer };

    const door = probe.pickDoor(ndc, hit.root);
    if (door) return { kind: 'door', node: door };
  }

  return { kind: 'select', instanceId: hit?.instanceId ?? null };
}
