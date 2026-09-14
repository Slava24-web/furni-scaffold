import { onBeforeUnmount, onMounted } from 'vue';
import {
  NUDGE_FINE_MM,
  NUDGE_STEP_MM,
  nudge,
  pushAgainst,
  placementBox,
  placementProductSize,
  type Placement,
  type PushSide,
} from '@furni/shared';
import { useCatalogStore } from '../stores/catalog';
import { useSceneStore } from '../stores/scene';

/**
 * Быстрая подгонка выделенного объекта.
 *
 * Примагничивание работает, только пока объект держат. А собирают кухню
 * иначе: поставил модуль примерно, а потом доводишь его до соседа.
 * Ловить мышью зазор в три миллиметра — это и есть та долгая подгонка,
 * ради которой заведены прижатие одним действием и шаг стрелками.
 *
 * Стрелки перехватываются только когда фокус не в поле ввода: иначе
 * стрелка в поле размера двигала бы объект вместо курсора.
 */
export function useQuickFit(deps: {
  selectedId: () => string | null;
  onCommit: (instanceId: string, patch: Partial<Placement>) => void;
}) {
  const scene = useSceneStore();
  const catalog = useCatalogStore();

  /** Габарит размещения и габариты всех остальных объектов сцены. */
  function boxes(instanceId: string) {
    const products = catalog.bySku;
    const subjectPlacement = scene.doc.placements.find((p) => p.instanceId === instanceId);
    const subjectProduct = subjectPlacement && products.get(subjectPlacement.sku);
    if (!subjectPlacement || !subjectProduct) return null;

    const others = [];
    for (const placement of scene.doc.placements) {
      if (placement.instanceId === instanceId) continue;
      const product = products.get(placement.sku);
      if (!product) continue;
      others.push(placementBox(placement, placementProductSize(placement, product)));
    }

    return {
      placement: subjectPlacement,
      subject: placementBox(subjectPlacement, placementProductSize(subjectPlacement, subjectProduct)),
      others,
    };
  }

  /** Прижать выделенный объект к ближайшему соседу с этой стороны. */
  function push(side: PushSide): boolean {
    const id = deps.selectedId();
    if (!id) return false;

    const found = boxes(id);
    if (!found) return false;

    const moved = pushAgainst(found.subject, found.others, side);
    if (!moved) return false;

    deps.onCommit(id, {
      position: {
        x: Math.round(moved.x),
        y: found.placement.position.y,
        z: Math.round(moved.y),
      },
    });
    return true;
  }

  /** Сдвинуть выделенный объект на шаг вдоль его собственной оси. */
  function step(side: PushSide, fine: boolean): boolean {
    const id = deps.selectedId();
    if (!id) return false;

    const found = boxes(id);
    if (!found) return false;

    const moved = nudge(found.subject, side, fine ? NUDGE_FINE_MM : NUDGE_STEP_MM);
    deps.onCommit(id, {
      position: {
        x: Math.round(moved.x),
        y: found.placement.position.y,
        z: Math.round(moved.y),
      },
    });
    return true;
  }

  const ARROWS: Record<string, PushSide> = {
    ArrowRight: 'right',
    ArrowLeft: 'left',
    ArrowUp: 'front',
    ArrowDown: 'back',
  };

  function onKey(event: KeyboardEvent): void {
    const side = ARROWS[event.key];
    if (!side) return;

    // Поля ввода забирают стрелки себе: там ими водят курсор
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (target?.isContentEditable) return;

    // Shift прижимает к соседу, обычная стрелка двигает на шаг
    const done = event.shiftKey ? push(side) : step(side, event.altKey);
    if (done) event.preventDefault();
  }

  onMounted(() => window.addEventListener('keydown', onKey));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

  return { push, step };
}
