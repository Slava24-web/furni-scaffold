import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Отдельный просмотрщик одной модели: приёмка загруженного файла.
 *
 * Не переиспользует Viewer намеренно. Тому нужны комната, каталог,
 * жесты и телеметрия, а здесь надо показать один объект на сетке и
 * померить его. Тащить ради этого весь движок значило бы грузить
 * сцену планировщика на странице, где сцены нет.
 *
 * Живёт вне Vue, как и всё, что трогает Three.js (CLAUDE.md, правило 1).
 */

/** Что вычитано из файла: ровно то, что проверяет checkModel в shared. */
export interface InspectedModel {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  minYMm: number;
  centreXMm: number;
  centreZMm: number;
  triangles: number;
  materials: string[];
  maxTextureSize: number;
  nodeNames: string[];
}

const MM = 1000;

/** Обмер модели в миллиметрах: glTF хранит метры. */
export function measure(root: Object3D): InspectedModel {
  const box = new Box3().setFromObject(root);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());

  let triangles = 0;
  const materials = new Set<string>();
  const nodeNames: string[] = [];
  let maxTextureSize = 0;

  root.traverse((node) => {
    // Имя из userData: GLTFLoader чистит служебные символы в node.name
    const name = (node.userData?.name as string | undefined) ?? node.name;
    if (name) nodeNames.push(name);
    if (!(node instanceof Mesh)) return;

    const index = node.geometry.getIndex();
    const position = node.geometry.getAttribute('position');
    triangles += (index ? index.count : (position?.count ?? 0)) / 3;

    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) {
      if (!material) continue;
      if (material.name) materials.add(material.name);
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap'] as const) {
        const texture = (material as unknown as Record<string, { image?: { width?: number; height?: number } }>)[key];
        if (!texture?.image) continue;
        maxTextureSize = Math.max(maxTextureSize, texture.image.width ?? 0, texture.image.height ?? 0);
      }
    }
  });

  return {
    widthMm: Math.round(size.x * MM),
    heightMm: Math.round(size.y * MM),
    depthMm: Math.round(size.z * MM),
    minYMm: Math.round(box.min.y * MM),
    centreXMm: Math.round(centre.x * MM),
    centreZMm: Math.round(centre.z * MM),
    triangles: Math.round(triangles),
    materials: [...materials],
    maxTextureSize,
    nodeNames,
  };
}

function disposeTree(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    const list = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of list) material?.dispose();
  });
}

export class ModelInspector {
  readonly #renderer: WebGLRenderer;
  readonly #scene = new Scene();
  readonly #camera: PerspectiveCamera;
  readonly #grid: GridHelper;
  #model: Group | null = null;
  #frame = 0;
  /** Угол облёта: модель поворачивается сама, её надо осмотреть кругом */
  #spin = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.#renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.#renderer.outputColorSpace = SRGBColorSpace;
    this.#renderer.toneMapping = ACESFilmicToneMapping;
    this.#renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));

    this.#camera = new PerspectiveCamera(38, 1, 0.05, 60);
    this.#scene.background = null;

    // Три источника: заливка, ключевой сверху-сбоку и контровой сзади.
    // Одна лампа даёт плоский силуэт, по которому качество не оценить
    this.#scene.add(new AmbientLight(0xffffff, 1.6));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(2.4, 3.4, 2.0);
    this.#scene.add(key);
    const rim = new DirectionalLight(0xdde6ff, 1.1);
    rim.position.set(-2.2, 1.6, -2.4);
    this.#scene.add(rim);

    // Сетка с шагом 100 мм: по ней видно и масштаб, и стоит ли модель на полу
    this.#grid = new GridHelper(4, 40, new Color(0x9aa0ab), new Color(0xd9dce1));
    this.#scene.add(this.#grid);

    this.#loop();
  }

  /**
   * Загрузка модели из файла, выбранного пользователем.
   *
   * Декодер meshopt подключается всегда: сжатый файл без него не
   * читается вовсе, а магазин может прислать уже оптимизированную
   * модель — наш же пайплайн выпускает именно такие.
   */
  async load(file: File): Promise<InspectedModel> {
    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    try {
      const gltf = await loader.loadAsync(url);
      this.#show(gltf.scene);
      return measure(gltf.scene);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  clear(): void {
    if (!this.#model) return;
    this.#scene.remove(this.#model);
    disposeTree(this.#model);
    this.#model = null;
  }

  resize(widthPx: number, heightPx: number): void {
    if (widthPx <= 0 || heightPx <= 0) return;
    this.#renderer.setSize(widthPx, heightPx, false);
    this.#camera.aspect = widthPx / heightPx;
    this.#camera.updateProjectionMatrix();
  }

  dispose(): void {
    cancelAnimationFrame(this.#frame);
    this.clear();
    this.#grid.geometry.dispose();
    this.#renderer.dispose();
  }

  #show(root: Object3D): void {
    this.clear();
    const group = new Group();
    group.add(root);
    this.#scene.add(group);
    this.#model = group;
    this.#frameCamera(root);
  }

  /** Камера отходит на габарит модели: и мелкая ручка, и пенал видны целиком. */
  #frameCamera(root: Object3D): void {
    const box = new Box3().setFromObject(root);
    const size = box.getSize(new Vector3());
    const radius = Math.max(0.2, size.length() / 2);

    this.#camera.position.set(radius * 1.5, Math.max(size.y * 0.7, radius), radius * 1.9);
    this.#camera.lookAt(0, size.y / 2, 0);
    this.#camera.far = radius * 20;
    this.#camera.updateProjectionMatrix();
  }

  #loop = (): void => {
    this.#frame = requestAnimationFrame(this.#loop);
    if (this.#model) {
      // Медленный оборот: приёмка модели — это осмотр со всех сторон
      this.#spin += 0.004;
      this.#model.rotation.y = this.#spin;
    }
    this.#renderer.render(this.#scene, this.#camera);
  };
}
