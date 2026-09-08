import {
  BoxGeometry,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  type Scene,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { computeWallPanels, wallAngleDeg, type Room } from '@furni/shared';

/**
 * Построение геометрии помещения из документа сцены.
 *
 * Все панели стен сливаются в ОДИН меш, а пол — во второй. Панелей у
 * комнаты с проёмами набирается два десятка, и по draw call на каждую
 * съело бы четверть бюджета (RENDER_BUDGETS.maxDrawCalls) ещё до мебели.
 *
 * Комната не регистрируется в SceneRegistry: это не объект каталога,
 * её нельзя выделить и перетащить, а ресурсами владеет сам билдер.
 */

const MM = 1000;

/**
 * План лежит в плоскости XZ: Vec2 документа это (x, z) мира.
 * Поворот вокруг Y идёт со знаком минус, потому что поворот на +φ
 * переводит +X в (cos φ, 0, −sin φ), а нам нужно (cos θ, 0, sin θ).
 */
function wallRotationY(angleDeg: number): number {
  return (-angleDeg * Math.PI) / 180;
}

export class RoomBuilder {
  readonly root = new Group();

  private readonly wallMaterial = new MeshStandardMaterial({
    color: 0xe9e6e1,
    roughness: 0.92,
    metalness: 0,
  });

  private readonly floorMaterial = new MeshStandardMaterial({
    color: 0xd8d4cd,
    roughness: 0.96,
    metalness: 0,
    // Пол виден и снизу, когда камера опускается к плинтусу
    side: DoubleSide,
  });

  private wallMesh: Mesh | null = null;
  private floorMesh: Mesh | null = null;

  constructor(private readonly scene: Scene) {
    this.root.name = 'room';
    scene.add(this.root);
  }

  /** Полная пересборка. Комнат немного, инкрементальность тут не окупается. */
  build(rooms: readonly Room[]): void {
    this.clear();

    const wallGeometries: BufferGeometry[] = [];
    const floorGeometries: BufferGeometry[] = [];

    for (const room of rooms) {
      for (const wall of room.walls) {
        for (const panel of computeWallPanels(wall, room.openings)) {
          wallGeometries.push(panelGeometry(wall, panel));
        }
      }
      const floor = floorGeometry(room);
      if (floor) floorGeometries.push(floor);
    }

    this.wallMesh = mergeIntoMesh(wallGeometries, this.wallMaterial, 'walls');
    if (this.wallMesh) this.root.add(this.wallMesh);

    this.floorMesh = mergeIntoMesh(floorGeometries, this.floorMaterial, 'floor');
    if (this.floorMesh) {
      // Чуть ниже нуля: мебель стоит на y = 0, и совпадающие плоскости
      // дают мерцание z-fighting на всей площади пола
      this.floorMesh.position.y = -0.005;
      this.root.add(this.floorMesh);
    }
  }

  /** Есть ли построенное помещение — по нему решается, показывать ли сетку. */
  get isEmpty(): boolean {
    return this.wallMesh === null && this.floorMesh === null;
  }

  private clear(): void {
    for (const mesh of [this.wallMesh, this.floorMesh]) {
      if (!mesh) continue;
      this.root.remove(mesh);
      mesh.geometry.dispose();
    }
    this.wallMesh = null;
    this.floorMesh = null;
  }

  dispose(): void {
    this.clear();
    this.wallMaterial.dispose();
    this.floorMaterial.dispose();
    this.scene.remove(this.root);
  }
}

/** Панель стены как прямоугольный блок, повёрнутый вдоль стены. */
function panelGeometry(
  wall: Room['walls'][number],
  panel: ReturnType<typeof computeWallPanels>[number],
): BufferGeometry {
  const height = panel.topMm - panel.bottomMm;
  const geometry = new BoxGeometry(panel.lengthMm / MM, height / MM, wall.thickness / MM);

  const center = panel.offsetMm + panel.lengthMm / 2;
  const angle = (wallAngleDeg(wall) * Math.PI) / 180;
  const x = (wall.start.x + Math.cos(angle) * center) / MM;
  const z = (wall.start.y + Math.sin(angle) * center) / MM;

  geometry.rotateY(wallRotationY(wallAngleDeg(wall)));
  geometry.translate(x, (panel.bottomMm + height / 2) / MM, z);
  return geometry;
}

/** Пол по осевому контуру стен. */
function floorGeometry(room: Room): BufferGeometry | null {
  if (room.walls.length < 3) return null;

  const shape = new Shape();
  room.walls.forEach((wall, index) => {
    // Знак Z инвертирован: после поворота плоскости вокруг X на −90°
    // координата y фигуры попадает в −z мира
    const x = wall.start.x / MM;
    const y = -wall.start.y / MM;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();

  const geometry = new ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function mergeIntoMesh(
  geometries: BufferGeometry[],
  material: MeshStandardMaterial,
  name: string,
): Mesh | null {
  if (geometries.length === 0) return null;

  const merged = mergeGeometries(geometries, false);
  for (const geometry of geometries) geometry.dispose();
  if (!merged) return null;

  merged.computeBoundingSphere();
  const mesh = new Mesh(merged, material);
  mesh.name = name;
  return mesh;
}
