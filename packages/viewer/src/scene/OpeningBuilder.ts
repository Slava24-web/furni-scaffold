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
  openingStyle,
  type Opening,
  type OpeningStyle,
  type Room,
  type Wall,
} from '@furni/shared';
import { MM, collectParts, placeOnWall } from './openingGeometry';

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
