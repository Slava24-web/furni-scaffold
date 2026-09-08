import { Box3, Group, Object3D, Scene, Vector3 } from 'three';

export interface RegisteredInstance {
  instanceId: string;
  productId: string;
  root: Group;
  /** Габарит в локальных координатах, мм. Кэшируется — Box3 дорог. */
  bounds: { min: Vector3; max: Vector3 };
  locked: boolean;
}

/**
 * Реестр размещённых объектов. Даёт O(1) доступ по instanceId и
 * освобождает GPU-ресурсы при удалении — иначе течёт видеопамять,
 * что на мобильных приводит к падению вкладки, а не к тормозам.
 */
export class SceneRegistry {
  private readonly instances = new Map<string, RegisteredInstance>();
  private readonly byObject = new WeakMap<Object3D, string>();

  constructor(private readonly scene: Scene) {}

  add(instanceId: string, productId: string, root: Group): RegisteredInstance {
    if (this.instances.has(instanceId)) {
      throw new Error(`Инстанс ${instanceId} уже зарегистрирован`);
    }
    const box = new Box3().setFromObject(root);
    const entry: RegisteredInstance = {
      instanceId,
      productId,
      root,
      bounds: { min: box.min.clone(), max: box.max.clone() },
      locked: false,
    };
    root.userData.instanceId = instanceId;
    root.traverse((o) => this.byObject.set(o, instanceId));
    this.instances.set(instanceId, entry);
    this.scene.add(root);
    return entry;
  }

  get(instanceId: string): RegisteredInstance | undefined {
    return this.instances.get(instanceId);
  }

  /** Поиск владельца по результату raycast — попасть можно в любой вложенный меш. */
  resolve(object: Object3D): RegisteredInstance | undefined {
    const id = this.byObject.get(object);
    return id ? this.instances.get(id) : undefined;
  }

  all(): Iterable<RegisteredInstance> {
    return this.instances.values();
  }

  remove(instanceId: string): void {
    const entry = this.instances.get(instanceId);
    if (!entry) return;
    this.scene.remove(entry.root);
    disposeTree(entry.root);
    this.instances.delete(instanceId);
  }

  disposeAll(): void {
    for (const id of [...this.instances.keys()]) this.remove(id);
  }
}

/** Освобождение геометрий и материалов. Текстуры — через общий кэш загрузчика. */
function disposeTree(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Object3D & {
      geometry?: { dispose(): void };
      material?: { dispose(): void } | { dispose(): void }[];
    };
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) {
      for (const m of mesh.material) m.dispose();
    } else {
      mesh.material?.dispose();
    }
  });
}
