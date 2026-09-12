import {
  Color,
  DoubleSide,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  type Mesh,
  type Object3D,
  type Texture,
} from 'three';

/**
 * Материалы тенанта, собранные в браузере.
 *
 * Отделку нельзя брать из GLB: туда попадают только те карты, которые
 * модель уже использует, и сменить фасад на текстурный было бы нечем.
 * Поэтому материалы описаны в каталоге, а текстуры лежат отдельными
 * файлами и грузятся один раз на весь тенант.
 */

export interface MaterialSpec {
  code: string;
  baseColorFactor: readonly [number, number, number, number];
  roughness: number;
  metallic: number;
  textureUrl?: string | undefined;
}

/**
 * Покрытие пола.
 *
 * `repeatMm` — сторона квадрата текстуры в миллиметрах. Без неё доска
 * растягивается на всю комнату и превращается в узор непонятного
 * масштаба: пол — единственная поверхность, где ошибка масштаба видна
 * сразу.
 */
export interface FloorSpec {
  code: string;
  textureUrl: string;
  repeatMm: number;
  roughness: number;
}

export class MaterialLibrary {
  private readonly specs = new Map<string, MaterialSpec>();
  private readonly floorSpecs = new Map<string, FloorSpec>();
  private readonly floors = new Map<string, MeshStandardMaterial>();
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly textures = new Map<string, Texture>();

  constructor(
    private readonly loadTexture: (url: string) => Promise<Texture> = defaultTextureLoader,
  ) {}

  register(specs: readonly MaterialSpec[]): void {
    for (const spec of specs) this.specs.set(spec.code, spec);
  }

  registerFloors(specs: readonly FloorSpec[]): void {
    for (const spec of specs) this.floorSpecs.set(spec.code, spec);
  }

  /**
   * Материал пола по коду покрытия.
   *
   * Цвет несёт текстура, поэтому база белая: множитель поверх карты
   * перемножал бы тон дважды и уводил дуб в оранжевый пластик.
   */
  floor(code: string): MeshStandardMaterial | undefined {
    const existing = this.floors.get(code);
    if (existing) return existing;

    const spec = this.floorSpecs.get(code);
    if (!spec) return undefined;

    const material = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: spec.roughness,
      metalness: 0,
      name: spec.code,
      side: DoubleSide,
    });
    material.userData.shared = true;

    this.floors.set(code, material);
    void this.attachTexture(material, spec.textureUrl, 1000 / spec.repeatMm);
    return material;
  }

  get known(): string[] {
    return [...this.specs.keys()];
  }

  /**
   * Материал по коду. Создаётся при первом обращении, дальше общий
   * на всю сцену: отдельная копия на каждый объект множила бы
   * уникальные материалы, а их число в бюджете ограничено.
   */
  get(code: string): MeshStandardMaterial | undefined {
    const existing = this.materials.get(code);
    if (existing) return existing;

    const spec = this.specs.get(code);
    if (!spec) return undefined;

    const material = new MeshStandardMaterial({
      color: new Color(spec.baseColorFactor[0], spec.baseColorFactor[1], spec.baseColorFactor[2]),
      roughness: spec.roughness,
      metalness: spec.metallic,
      name: spec.code,
    });
    // Владелец материала — библиотека: SceneRegistry не должен освобождать
    // его при удалении объекта, иначе он пропадёт у всех остальных
    material.userData.shared = true;

    this.materials.set(code, material);
    if (spec.textureUrl) void this.attachTexture(material, spec.textureUrl);
    return material;
  }

  private async attachTexture(
    material: MeshStandardMaterial,
    url: string,
    repeatPerMetre?: number,
  ): Promise<void> {
    try {
      const texture = this.textures.get(url) ?? (await this.loadTexture(url));
      texture.colorSpace = SRGBColorSpace;
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
      this.textures.set(url, texture);

      material.map = texture;
      // Повтор задаётся на материале, а не на общей текстуре: одна и та
      // же карта может лежать и на фасаде, и на полу с разным масштабом
      if (repeatPerMetre !== undefined) {
        material.map = texture.clone();
        material.map.needsUpdate = true;
        material.map.wrapS = RepeatWrapping;
        material.map.wrapT = RepeatWrapping;
        material.map.repeat.set(repeatPerMetre, repeatPerMetre);
      }
      material.needsUpdate = true;
    } catch {
      // Текстура не пришла — материал остаётся одноцветным.
      // Это лучше, чем пустой фасад или падение сцены
    }
  }

  dispose(): void {
    for (const material of this.floors.values()) {
      material.map?.dispose();
      material.dispose();
    }
    this.floors.clear();
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
    this.materials.clear();
    this.textures.clear();
  }
}

function defaultTextureLoader(url: string): Promise<Texture> {
  return new TextureLoader().loadAsync(url);
}

/**
 * Подмена материалов по слотам отделки.
 *
 * Слот опознаётся по ИМЕНИ материала, запечённого в модель. После первой
 * подмены имя сменилось бы, поэтому исходное запоминается в userData —
 * иначе вторую смену отделки было бы не к чему привязать.
 *
 * @param finishes слот -> материал; отсутствие записи возвращает исходный
 */
export function applyFinishes(
  root: Object3D,
  finishes: Readonly<Record<string, MeshStandardMaterial | undefined>>,
): void {
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;

    const current = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!current) return;

    if (mesh.userData.slotMaterial === undefined) {
      mesh.userData.slotMaterial = current.name;
      mesh.userData.defaultMaterial = current;
    }

    const slot = mesh.userData.slotMaterial as string;
    const replacement = finishes[slot] ?? (mesh.userData.defaultMaterial as typeof current);
    if (replacement && replacement !== current) mesh.material = replacement;
  });
}
