import { BoxGeometry, BufferGeometry, Object3D } from 'three';
import {
  openingMaterial,
  pointAlongWall,
  wallAngleDeg,
  wallNormal,
  innerNormal,
  type Opening,
  type OpeningStyle,
  type Room,
  type Wall,
} from '@furni/shared';

/**
 * Геометрия дверей и окон.
 *
 * Отделена от сцены: здесь только числа и BufferGeometry — ни материалов,
 * ни групп, ни жизненного цикла. Строится параметрически, а не грузится
 * готовой моделью: проёмы бывают любой ширины, и растянутая модель
 * растягивает вместе с полотном профиль коробки — рама 70 мм
 * превращается в 110, и окно перестаёт быть тем изделием, которое
 * заказали.
 */

/** Миллиметры в метры: Three.js считает в метрах. */
export const MM = 1000;
/** Толщина дверного полотна и оконной створки. */
const DOOR_LEAF_MM = 40;
const SASH_DEPTH_MM = 58;
const GLASS_MM = 6;
/** Зазор между полотном и коробкой. */
const GAP_MM = 4;

/** Ширина профиля створки по типу коробки. */
const SASH_RAIL_MM: Record<OpeningStyle['profile'], number> = {
  pvc: 62,
  wood: 78,
  aluminium: 46,
};

/** Детали проёма, разложенные по тому, как они крепятся и красятся. */
export interface Parts {
  /** Неподвижные детали по коду материала: коробка и подоконник */
  byMaterial: Map<string, BufferGeometry[]>;
  /** Детали полотна: они уезжают вместе с открытой дверью */
  leafByMaterial: Map<string, BufferGeometry[]>;
  glass: BufferGeometry[];
  handle: BufferGeometry[];
  /** Подоконник: его цвет не заказывают вместе с окном */
  sill: BufferGeometry[];
}

/**
 * Поворот группы в плоскость стены и перенос в центр проёма.
 *
 * Локальные оси: +X вдоль стены, +Y вверх, +Z в сторону помещения.
 * Знак Z выбирается по внутренней нормали: подоконник и ручка обязаны
 * оказаться внутри комнаты, а не на улице.
 */
export function placeOnWall(group: Object3D, room: Room, wall: Wall, centreOffsetMm: number): void {
  const angle = wallAngleDeg(wall);
  const centre = pointAlongWall(wall, centreOffsetMm);

  const inner = innerNormal(room, wall);
  const left = wallNormal(wall);
  // Локальная +Z после поворота смотрит вдоль левой нормали стены
  const insideIsLeft = inner.x * left.x + inner.y * left.y >= 0;
  if (!insideIsLeft) group.scale.setZ(-1);

  group.rotation.y = (-angle * Math.PI) / 180;
  group.position.set(centre.x / MM, 0, centre.y / MM);
  group.updateMatrixWorld(true);
}

/** Коробка, створки, заполнение и ручка одного проёма. */
export function collectParts(opening: Opening, style: OpeningStyle, thicknessMm: number): Parts {
  const parts: Parts = {
    byMaterial: new Map(),
    leafByMaterial: new Map(),
    glass: [],
    handle: [],
    sill: [],
  };
  const code = openingMaterial(style, opening.options);
  const frame = (geometry: BufferGeometry): void => {
    const list = parts.byMaterial.get(code) ?? [];
    list.push(geometry);
    parts.byMaterial.set(code, list);
  };

  /** Деталь полотна: коробка остаётся на месте, полотно уезжает. */
  const leaf = (geometry: BufferGeometry): void => {
    const list = parts.leafByMaterial.get(code) ?? [];
    list.push(geometry);
    parts.leafByMaterial.set(code, list);
  };

  const width = opening.width;
  const height = opening.height;
  const sill = opening.sillHeight;
  const profile = style.frameWidthMm;
  const isWindow = style.kind === 'window';

  // Коробка по периметру проёма; порога у межкомнатной двери нет
  frame(box(profile, height, thicknessMm, -(width - profile) / 2, sill + height / 2, 0));
  frame(box(profile, height, thicknessMm, (width - profile) / 2, sill + height / 2, 0));
  frame(box(width - profile * 2, profile, thicknessMm, 0, sill + height - profile / 2, 0));
  if (isWindow) {
    frame(box(width - profile * 2, profile, thicknessMm, 0, sill + profile / 2, 0));
  }

  const revealWidth = width - profile * 2;
  const revealBottom = sill + (isWindow ? profile : 0);
  const revealTop = sill + height - profile;
  const revealHeight = revealTop - revealBottom;
  if (revealWidth <= 0 || revealHeight <= 0) return parts;

  const sashes = Math.max(1, style.sashes);
  const sashWidth = revealWidth / sashes;
  const depth = isWindow ? SASH_DEPTH_MM : DOOR_LEAF_MM;

  for (let index = 0; index < sashes; index++) {
    const centreX = -revealWidth / 2 + sashWidth * (index + 0.5);
    const centreY = revealBottom + revealHeight / 2;
    const leafWidth = sashWidth - GAP_MM;
    const leafHeight = revealHeight - GAP_MM;

    if (style.fill === 'flush') {
      leaf(box(leafWidth, leafHeight, depth, centreX, centreY, 0));
      continue;
    }

    // Обвязка створки и заполнение внутри неё
    const rail = Math.min(SASH_RAIL_MM[style.profile], Math.min(leafWidth, leafHeight) / 3);
    leaf(box(rail, leafHeight, depth, centreX - (leafWidth - rail) / 2, centreY, 0));
    leaf(box(rail, leafHeight, depth, centreX + (leafWidth - rail) / 2, centreY, 0));
    leaf(box(leafWidth - rail * 2, rail, depth, centreX, centreY + (leafHeight - rail) / 2, 0));
    leaf(box(leafWidth - rail * 2, rail, depth, centreX, centreY - (leafHeight - rail) / 2, 0));

    const fillWidth = leafWidth - rail * 2;
    const fillHeight = leafHeight - rail * 2;
    if (fillWidth <= 0 || fillHeight <= 0) continue;

    if (style.fill === 'glazed') {
      parts.glass.push(box(fillWidth, fillHeight, GLASS_MM, centreX, centreY, 0));
    } else {
      // Филёнка утоплена относительно обвязки: без утопления полотно
      // читается сплошным щитом
      leaf(box(fillWidth, fillHeight, depth - 16, centreX, centreY, 0));
    }
  }

  if (style.kind === 'door') {
    parts.handle.push(...doorHandle(opening, style, revealWidth, revealBottom, revealHeight));
  } else {
    // Подоконник: без него окно выглядит дырой в стене
    const boardDepth = thicknessMm * 0.6 + 120;
    parts.sill.push(
      box(width + 80, 30, boardDepth, 0, sill - 15, boardDepth / 2 - thicknessMm / 2),
    );
  }

  return parts;
}

/** Ручка на стороне, противоположной петлям. */
function doorHandle(
  opening: Opening,
  style: OpeningStyle,
  revealWidth: number,
  revealBottom: number,
  revealHeight: number,
): BufferGeometry[] {
  const side = opening.hinge === 'left' ? 1 : -1;
  const sashes = Math.max(1, style.sashes);
  // У двустворчатой двери ручка ставится на активной створке
  const edge = (revealWidth / sashes) * (sashes === 1 ? 0.5 : 1.5) - 60;
  const x = side * Math.min(edge, revealWidth / 2 - 60);
  const y = revealBottom + Math.min(1050 - opening.sillHeight, revealHeight * 0.5);
  const depth = DOOR_LEAF_MM / 2 + 30;

  return [
    box(28, 28, depth, x, y, depth / 2),
    box(120, 22, 22, x - side * 46, y, depth),
  ];
}

/** Параллелепипед в локальных осях проёма, миллиметры. */
function box(
  widthMm: number,
  heightMm: number,
  depthMm: number,
  xMm: number,
  yMm: number,
  zMm: number,
): BufferGeometry {
  const geometry = new BoxGeometry(
    Math.max(1, widthMm) / MM,
    Math.max(1, heightMm) / MM,
    Math.max(1, depthMm) / MM,
  );
  geometry.translate(xMm / MM, yMm / MM, zMm / MM);
  return geometry;
}
