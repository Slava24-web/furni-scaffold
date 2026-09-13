import { Vector2 } from 'three';
import type { SnapTarget } from '@furni/viewer';
import { groupIntoChains, innerNormal, type Box, type Room } from '@furni/shared';

/**
 * Построение целей привязки из документа сцены.
 *
 * Чистая функция над комнатами и габаритами: ни Vue, ни состояния жеста.
 * Считается один раз на старте перетаскивания — за жест ни стены,
 * ни соседи не меняются.
 */

export interface IdentifiedBox {
  id: string;
  box: Box;
}

/** Стены как цели примагничивания: объект встаёт к внутренней грани. */
export function wallSnapTargets(rooms: readonly Room[]): SnapTarget[] {
  const targets: SnapTarget[] = [];

  for (const room of rooms) {
    for (const wall of room.walls) {
      const normal = innerNormal(room, wall);
      targets.push({
        kind: 'wall',
        a: new Vector2(wall.start.x, wall.start.y),
        b: new Vector2(wall.end.x, wall.end.y),
        normal: new Vector2(normal.x, normal.y),
        halfThicknessMm: wall.thickness / 2,
        sourceId: wall.id,
      });
    }
  }

  return targets;
}

/**
 * Соседи как цели стыковки.
 *
 * Цели строятся по ЦЕПОЧКАМ, а не по отдельным модулям: ряд кухни это
 * один фронт, и столешницу выравнивают по краю всего ряда, а не по краю
 * случайной тумбы внутри него. Одиночный модуль — цепочка из одного,
 * поэтому для отдельной мебели ничего не меняется.
 */
export function chainSnapTargets(boxes: readonly IdentifiedBox[]): SnapTarget[] {
  return groupIntoChains(boxes).map((chain) => ({
    kind: 'object' as const,
    position: new Vector2(chain.box.centre.x, chain.box.centre.y),
    rotation: chain.box.rotationDeg,
    sourceId: chain.memberIds[0] ?? '',
    footprint: {
      halfWidthMm: chain.box.halfWidthMm,
      halfDepthMm: chain.box.halfDepthMm,
      // Высоты решают, стыковать сбоку или выравнивать поверх:
      // столешница и верхний шкаф ложатся НАД нижним рядом
      bottomMm: chain.box.bottomMm,
      topMm: chain.box.topMm,
    },
  }));
}

/** Все цели привязки для одного жеста. */
export function snapTargets(rooms: readonly Room[], neighbours: readonly IdentifiedBox[]): SnapTarget[] {
  return [...wallSnapTargets(rooms), ...chainSnapTargets(neighbours)];
}
