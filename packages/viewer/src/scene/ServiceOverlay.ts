import {
  BoxGeometry,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  type Scene,
} from 'three';
import { serviceInfo, type ServicePoint } from '@furni/shared';

/**
 * Метки инженерии в сцене.
 *
 * Розетку и вывод воды не видно на модели, а расставлять мебель без них
 * — это переделка на монтаже. Метка ставится и на стене, на своей
 * высоте, и на полу: сверху план читают по полу, сбоку — по стене.
 *
 * Геометрия общая на все метки: их бывает под сотню, и по паре мешей
 * на каждую съело бы бюджет draw calls.
 */

const MM = 1000;
/** Размер метки на стене. */
const PLATE_MM = 90;
/** Радиус точки на полу. */
const DOT_MM = 70;

export class ServiceOverlay {
  readonly root = new Group();

  private readonly plate = new BoxGeometry(PLATE_MM / MM, PLATE_MM / MM, 30 / MM);
  private readonly dot = new CircleGeometry(DOT_MM / MM, 16);
  private readonly materials = new Map<string, MeshBasicMaterial>();
  private meshes: Mesh[] = [];

  constructor(private readonly scene: Scene) {
    this.root.name = 'services';
    scene.add(this.root);
  }

  build(services: readonly ServicePoint[]): void {
    this.clear();

    for (const service of services) {
      const info = serviceInfo(service.kind);
      const material = this.materialFor(info.colour);

      const plate = new Mesh(this.plate, material);
      plate.position.set(service.position.x / MM, service.heightMm / MM, service.position.y / MM);
      plate.userData['serviceId'] = service.id;
      this.add(plate);

      // Точка на полу: сверху метка на стене не видна вовсе
      const dot = new Mesh(this.dot, material);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(service.position.x / MM, 0.008, service.position.y / MM);
      dot.userData['serviceId'] = service.id;
      this.add(dot);
    }
  }

  /** Цели для луча: по метке её и удаляют. */
  get targets(): Object3D[] {
    return this.meshes;
  }

  resolve(object: Object3D): string | null {
    const id = object.userData?.['serviceId'];
    return typeof id === 'string' ? id : null;
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  private add(mesh: Mesh): void {
    this.meshes.push(mesh);
    this.root.add(mesh);
  }

  private materialFor(colour: string): MeshBasicMaterial {
    const existing = this.materials.get(colour);
    if (existing) return existing;

    const material = new MeshBasicMaterial({ color: new Color(colour), toneMapped: false });
    this.materials.set(colour, material);
    return material;
  }

  private clear(): void {
    for (const mesh of this.meshes) this.root.remove(mesh);
    this.meshes = [];
  }

  dispose(): void {
    this.clear();
    this.plate.dispose();
    this.dot.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.scene.remove(this.root);
  }
}
