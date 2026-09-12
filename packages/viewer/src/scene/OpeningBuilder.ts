import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  openingMaterial,
  openingStyle,
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
 * Двери и окна в проёмах.
 *
 * Геометрия строится параметрически, а не грузится готовой моделью:
 * проёмы бывают любой ширины, и растянутая модель растягивает вместе с
 * полотном профиль коробки — рама 70 мм превращается в 110, и окно
 * перестаёт быть тем изделием, которое заказали.
 *
 * Детали одного материала сливаются в один меш: по draw call на каждый
 * штапик съело бы бюджет (RENDER_BUDGETS.maxDrawCalls) на одной комнате.
 *
 * Каждый проём — отдельная группа с openingId: по ней тап выбирает
 * дверь, а не стену за ней.
 */

const MM = 1000;
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

/** Материалы деталей, которые не заказывают отдельно. */
const GLASS_COLOR = 0xbcd3de;
const HANDLE_COLOR = 0x9aa2ad;

export interface MaterialSource {
  get(code: string): MeshStandardMaterial | undefined;
}

/** Прямоугольник, который проём вырежет в стене. */
export interface OpeningFootprint {
  offsetMm: number;
  widthMm: number;
  heightMm: number;
  sillMm: number;
}

interface Parts {
  /** Неподвижные детали по коду материала: коробка и подоконник */
  byMaterial: Map<string, BufferGeometry[]>;
  /** Детали полотна: они уезжают вместе с открытой дверью */
  leafByMaterial: Map<string, BufferGeometry[]>;
  glass: BufferGeometry[];
  handle: BufferGeometry[];
  /** Подоконник: его цвет не заказывают вместе с окном */
  sill: BufferGeometry[];
}

export class OpeningBuilder {
  readonly root = new Group();

  private readonly glassMaterial = new MeshStandardMaterial({
    color: GLASS_COLOR,
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0.32,
    side: DoubleSide,
  });

  private readonly handleMaterial = new MeshStandardMaterial({
    color: HANDLE_COLOR,
    roughness: 0.3,
    metalness: 0.85,
  });

  /** Запасной материал: каталог тенанта мог ещё не загрузиться. */
  private readonly fallbackMaterial = new MeshStandardMaterial({
    color: 0xf2f2f0,
    roughness: 0.6,
    metalness: 0,
  });

  private readonly sillMaterial = new MeshStandardMaterial({
    color: 0xeceae6,
    roughness: 0.5,
    metalness: 0,
  });

  private groups: { openingId: string; group: Group }[] = [];
  /**
   * Какие двери открыты.
   *
   * Состояние живёт во вьюере, а не в документе: распахнутая дверь это
   * осмотр, а не свойство планировки. Пересборка сцены его не теряет —
   * иначе дверь захлопывалась бы на каждую правку размера комнаты.
   */
  private readonly opened = new Set<string>();
  private previewMesh: Mesh | null = null;

  /** Подсветка будущего места проёма. */
  private readonly previewMaterial = new MeshStandardMaterial({
    color: 0x2f6fed,
    roughness: 0.4,
    metalness: 0,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: DoubleSide,
  });

  constructor(private readonly scene: Scene) {
    this.root.name = 'openings';
    scene.add(this.root);
  }

  /** Полная пересборка: проёмов единицы, инкрементальность не окупается. */
  build(rooms: readonly Room[], materials: MaterialSource): void {
    this.clear();

    for (const room of rooms) {
      for (const opening of room.openings) {
        const style = openingStyle(opening.sku);
        const wall = room.walls.find((candidate) => candidate.id === opening.wallId);
        if (!style || !wall) continue;

        const group = this.buildOpening(room, wall, opening, style, materials);
        if (!group) continue;

        group.userData['openingId'] = opening.id;
        this.groups.push({ openingId: opening.id, group });
        this.root.add(group);
      }
    }
  }

  /**
   * Подсветка места, куда встанет проём.
   *
   * Без неё пользователь тапает вслепую: он видит стену, но не знает,
   * какой кусок её займёт дверь и хватит ли ей места до угла.
   * Показывается ровно тот прямоугольник, который вырежет вставка.
   */
  previewAt(room: Room | null, wall: Wall | null, footprint: OpeningFootprint | null): void {
    this.clearPreview();
    if (!room || !wall || !footprint) return;

    const geometry = new BoxGeometry(
      footprint.widthMm / MM,
      footprint.heightMm / MM,
      (wall.thickness + 40) / MM,
    );
    geometry.translate(0, (footprint.sillMm + footprint.heightMm / 2) / MM, 0);

    const mesh = new Mesh(geometry, this.previewMaterial);
    placeOnWall(mesh, room, wall, footprint.offsetMm + footprint.widthMm / 2);
    this.previewMesh = mesh;
    this.root.add(mesh);
  }

  private clearPreview(): void {
    if (!this.previewMesh) return;
    this.root.remove(this.previewMesh);
    this.previewMesh.geometry.dispose();
    this.previewMesh = null;
  }

  /** Цели для луча: сами изделия в проёмах. */
  get targets(): Object3D[] {
    return this.groups.map((entry) => entry.group);
  }

  /** Открыта ли дверь проёма. */
  isOpen(openingId: string): boolean {
    return this.opened.has(openingId);
  }

  /**
   * Открыть или закрыть дверь.
   *
   * Возвращает true, если состояние изменилось: по нему вызывающий код
   * решает, надо ли пересобирать сцену.
   */
  setOpen(openingId: string, open: boolean): boolean {
    const was = this.opened.has(openingId);
    if (was === open) return false;

    if (open) this.opened.add(openingId);
    else this.opened.delete(openingId);
    return true;
  }

  /** Проём, которому принадлежит объект под лучом. */
  resolve(object: Object3D): string | null {
    for (let node: Object3D | null = object; node; node = node.parent) {
      const id = node.userData?.['openingId'];
      if (typeof id === 'string') return id;
    }
    return null;
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  private buildOpening(
    room: Room,
    wall: Wall,
    opening: Opening,
    style: OpeningStyle,
    materials: MaterialSource,
  ): Group | null {
    const parts = collectParts(opening, style, wall.thickness);
    const group = new Group();

    /**
     * Полотно живёт в своей группе с началом в точке навески: только так
     * распахнутая дверь поворачивается вокруг петель, а не вокруг центра
     * проёма.
     */
    const leaf = new Group();
    const hingeX = (opening.hinge === 'left' ? -1 : 1) * (opening.width / 2 - style.frameWidthMm);
    leaf.position.x = hingeX / MM;
    if (style.kind === 'door' && this.opened.has(opening.id)) {
      const side = opening.swingInward ? 1 : -1;
      const direction = opening.hinge === 'left' ? -1 : 1;
      leaf.rotation.y = (side * direction * Math.PI) / 2;
    }
    group.add(leaf);

    const add = (
      geometries: BufferGeometry[],
      material: MeshStandardMaterial,
      movable = false,
    ): void => {
      const merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) geometry.dispose();
      if (!merged) return;
      merged.computeBoundingSphere();
      // Геометрия полотна сдвигается на петлю: сама группа уже там
      if (movable) merged.translate(-hingeX / MM, 0, 0);
      (movable ? leaf : group).add(new Mesh(merged, material));
    };

    for (const [materialCode, geometries] of parts.byMaterial) {
      add(geometries, materials.get(materialCode) ?? this.fallbackMaterial, false);
    }
    for (const [materialCode, geometries] of parts.leafByMaterial) {
      add(geometries, materials.get(materialCode) ?? this.fallbackMaterial, true);
    }
    if (parts.glass.length > 0) add(parts.glass, this.glassMaterial, style.kind === 'door');
    if (parts.handle.length > 0) add(parts.handle, this.handleMaterial, true);
    if (parts.sill.length > 0) add(parts.sill, this.sillMaterial);
    if (group.children.length === 0) return null;

    placeOnWall(group, room, wall, opening.offset + opening.width / 2);
    return group;
  }

  private clear(): void {
    this.clearPreview();
    for (const entry of this.groups) {
      this.root.remove(entry.group);
      entry.group.traverse((node) => {
        if (node instanceof Mesh) node.geometry.dispose();
      });
    }
    this.groups = [];
  }

  dispose(): void {
    this.clear();
    this.glassMaterial.dispose();
    this.handleMaterial.dispose();
    this.fallbackMaterial.dispose();
    this.sillMaterial.dispose();
    this.previewMaterial.dispose();
    this.scene.remove(this.root);
  }
}

/**
 * Поворот группы в плоскость стены и перенос в центр проёма.
 *
 * Локальные оси: +X вдоль стены, +Y вверх, +Z в сторону помещения.
 * Знак Z выбирается по внутренней нормали: подоконник и ручка обязаны
 * оказаться внутри комнаты, а не на улице.
 */
function placeOnWall(group: Object3D, room: Room, wall: Wall, centreOffsetMm: number): void {
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
function collectParts(opening: Opening, style: OpeningStyle, thicknessMm: number): Parts {
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
