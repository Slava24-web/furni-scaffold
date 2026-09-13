import { computed, shallowRef, type ShallowRef } from 'vue';
import type { Viewer } from '@furni/viewer';
import {
  EMPTY_CONFLICTS,
  findConflicts,
  hasConflicts,
  type Box,
  type ConflictReport,
  type SwingZone,
  type Wall,
} from '@furni/shared';

/**
 * Состояние конфликтов выделенного объекта и его отражение в сцене.
 *
 * Отдельно от жестов: считать пересечения и подсвечивать виновника —
 * это одна забота, а разбирать касания указателя — другая.
 */

/** Окружение, относительно которого проверяется объект. */
export interface ConflictEnvironment {
  neighbours: readonly { id: string; box: Box }[];
  walls: readonly Wall[];
  swings: readonly SwingZone[];
  drawerZones: readonly { instanceId: string; box: Box }[];
}

export function useSceneConflicts(viewer: ShallowRef<Viewer | null>) {
  const conflicts = shallowRef<ConflictReport>(EMPTY_CONFLICTS);
  const hasConflict = computed(() => hasConflicts(conflicts.value));

  /** Подсветить сами конфликтующие объекты, а не только рамку выделения. */
  function highlight(instanceIds: readonly string[]): void {
    const v = viewer.value;
    if (!v) return;

    const roots = instanceIds
      .map((id) => v.registry.get(id)?.root)
      .filter((root): root is NonNullable<typeof root> => root !== undefined);
    v.conflicts.show(roots);
  }

  /** Ничего не выделено или габарит неизвестен: конфликтов нет. */
  function clear(): void {
    const v = viewer.value;
    conflicts.value = EMPTY_CONFLICTS;
    v?.selection.setConflict(false);
    v?.conflicts.clear();
  }

  /** Пересчитать конфликты объекта и показать их в сцене. */
  function evaluate(subject: Box, env: ConflictEnvironment, ownDrawerZone: Box | null): void {
    const v = viewer.value;
    conflicts.value = findConflicts(subject, env.neighbours, env.walls, undefined, env.swings, {
      own: ownDrawerZone,
      neighbours: env.drawerZones,
    });
    v?.selection.setConflict(hasConflicts(conflicts.value));
    highlight([...conflicts.value.objectIds, ...conflicts.value.blockedDrawerIds]);
    v?.invalidate();
  }

  /** Проверка без записи в состояние: для призрака переносимого товара. */
  function probe(subject: Box, env: ConflictEnvironment, ownDrawerZone: Box | null): ConflictReport {
    return findConflicts(subject, env.neighbours, env.walls, undefined, env.swings, {
      own: ownDrawerZone,
      neighbours: env.drawerZones,
    });
  }

  return { conflicts, hasConflict, highlight, clear, evaluate, probe };
}
