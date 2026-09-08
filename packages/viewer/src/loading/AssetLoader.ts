import { Group, LoadingManager, type Texture, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export type LodLevel = 0 | 1 | 2;

export interface AssetRef {
  productId: string;
  /** URL шаблон с плейсхолдером {lod}, например /assets/abc/lod{lod}.glb */
  urlTemplate: string;
}

interface CacheEntry {
  promise: Promise<Group>;
  refCount: number;
  bytes: number;
}

/**
 * Загрузчик моделей с кэшем и подсчётом ссылок.
 *
 * KTX2 обязателен: несжатые PNG/JPEG в видеопамяти занимают в разы больше
 * и являются главной причиной падения вкладки на мобильных (ТЗ 6.1).
 * Meshopt предпочтительнее Draco: быстрее декодирует на слабом CPU.
 */
export class AssetLoader {
  private readonly gltf: GLTFLoader;
  private readonly ktx2: KTX2Loader;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly textureCache = new Map<string, Texture>();
  private textureBytes = 0;

  constructor(
    renderer: WebGLRenderer,
    private readonly options: {
      transcoderPath: string;
      maxTextureBytes: number;
    },
  ) {
    const manager = new LoadingManager();
    this.ktx2 = new KTX2Loader(manager)
      .setTranscoderPath(options.transcoderPath)
      .detectSupport(renderer);

    this.gltf = new GLTFLoader(manager);
    this.gltf.setKTX2Loader(this.ktx2);
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
  }

  private key(ref: AssetRef, lod: LodLevel): string {
    return `${ref.productId}:${lod}`;
  }

  /**
   * Загрузка модели. Возвращает КЛОН — оригинал остаётся в кэше.
   * Клонирование Group переиспользует geometry и material, поэтому дёшево.
   */
  async load(ref: AssetRef, lod: LodLevel): Promise<Group> {
    const key = this.key(ref, lod);
    let entry = this.cache.get(key);

    if (!entry) {
      const url = ref.urlTemplate.replace('{lod}', String(lod));
      const promise = this.gltf.loadAsync(url).then((gltf) => gltf.scene);
      entry = { promise, refCount: 0, bytes: 0 };
      this.cache.set(key, entry);
    }

    entry.refCount++;
    const original = await entry.promise;
    // Клон переиспользует геометрию и материалы оригинала. Помечаем их
    // общими, чтобы SceneRegistry не освободил их при удалении одного
    // инстанса — владелец этих ресурсов кэш загрузчика.
    markShared(original);
    return original.clone(true);
  }

  /**
   * Прогрессивная загрузка (ТЗ 7.4): сначала LOD2 для мгновенного отклика,
   * затем LOD0 в фоне. Пользователь видит объект через ~150 мс вместо ~800 мс.
   */
  async loadProgressive(
    ref: AssetRef,
    onLod: (group: Group, lod: LodLevel) => void,
  ): Promise<void> {
    const preview = await this.load(ref, 2);
    onLod(preview, 2);
    try {
      const full = await this.load(ref, 0);
      onLod(full, 0);
    } catch (err) {
      // Остаёмся на LOD2 — это рабочее состояние, не ошибка для пользователя
      console.warn('[AssetLoader] LOD0 не загрузился, остаёмся на превью', err);
    }
  }

  release(ref: AssetRef, lod: LodLevel): void {
    const key = this.key(ref, lod);
    const entry = this.cache.get(key);
    if (!entry) return;
    entry.refCount = Math.max(0, entry.refCount - 1);
  }

  /** Вытеснение неиспользуемых ассетов при приближении к лимиту видеопамяти. */
  evictIfNeeded(): void {
    if (this.textureBytes < this.options.maxTextureBytes * 0.9) return;
    for (const [key, entry] of this.cache) {
      if (entry.refCount === 0) {
        void entry.promise.then((group) => {
          group.traverse((o) => {
            const m = o as { geometry?: { dispose(): void } };
            m.geometry?.dispose();
          });
        });
        this.cache.delete(key);
        this.textureBytes -= entry.bytes;
        if (this.textureBytes < this.options.maxTextureBytes * 0.7) break;
      }
    }
  }

  dispose(): void {
    this.ktx2.dispose();
    for (const t of this.textureCache.values()) t.dispose();
    this.textureCache.clear();
    this.cache.clear();
  }
}

type SharedResource = { userData: Record<string, unknown> };

function markShared(root: Group): void {
  root.traverse((obj) => {
    const mesh = obj as unknown as {
      geometry?: SharedResource;
      material?: SharedResource | SharedResource[];
    };
    if (mesh.geometry) mesh.geometry.userData.shared = true;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const m of materials) m.userData.shared = true;
  });
}
