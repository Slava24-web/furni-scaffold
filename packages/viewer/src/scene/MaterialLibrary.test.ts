import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MaterialLibrary, applyFinishes, type MaterialSpec } from './MaterialLibrary';

const spec = (code: string, over: Partial<MaterialSpec> = {}): MaterialSpec => ({
  code,
  baseColorFactor: [0.5, 0.6, 0.7, 1],
  roughness: 0.4,
  metallic: 0,
  ...over,
});

/** Модель как её отдаёт загрузчик: меши с именованными материалами. */
function model(materialNames: string[]): Group {
  const group = new Group();
  for (const name of materialNames) {
    const material = new MeshStandardMaterial({ name });
    material.userData.shared = true;
    group.add(new Mesh(new BoxGeometry(1, 1, 1), material));
  }
  return group;
}

const meshMaterialNames = (group: Group): string[] =>
  group.children.map((child) => ((child as Mesh).material as MeshStandardMaterial).name);

describe('библиотека материалов', () => {
  it('создаёт материал по описанию', () => {
    const library = new MaterialLibrary();
    library.register([spec('oak')]);

    const material = library.get('oak');
    expect(material?.name).toBe('oak');
    expect(material?.roughness).toBe(0.4);
  });

  it('материал общий на всю сцену', () => {
    // Копия на каждый объект множила бы уникальные материалы,
    // а их число ограничено бюджетом
    const library = new MaterialLibrary();
    library.register([spec('oak')]);

    expect(library.get('oak')).toBe(library.get('oak'));
  });

  it('помечает материал общим, чтобы реестр его не освободил', () => {
    const library = new MaterialLibrary();
    library.register([spec('oak')]);

    expect(library.get('oak')?.userData.shared).toBe(true);
  });

  it('неизвестный код не создаёт материал', () => {
    expect(new MaterialLibrary().get('нет-такого')).toBeUndefined();
  });

  it('текстура подключается после загрузки', async () => {
    const texture = new Texture();
    const load = vi.fn().mockResolvedValue(texture);
    const library = new MaterialLibrary(load);
    library.register([spec('oak', { textureUrl: '/wood.webp' })]);

    const material = library.get('oak')!;
    await vi.waitFor(() => expect(material.map).toBe(texture));
    expect(load).toHaveBeenCalledWith('/wood.webp');
  });

  it('одна текстура на несколько материалов', async () => {
    const load = vi.fn().mockImplementation(async () => new Texture());
    const library = new MaterialLibrary(load);
    library.register([
      spec('oak', { textureUrl: '/wood.webp' }),
      spec('oak-dark', { textureUrl: '/wood.webp' }),
    ]);

    library.get('oak');
    await vi.waitFor(() => expect(load).toHaveBeenCalled());
    library.get('oak-dark');
    await vi.waitFor(() => expect(library.get('oak-dark')?.map).not.toBeNull());

    expect(load).toHaveBeenCalledTimes(1);
  });

  it('сбой загрузки текстуры не роняет материал', async () => {
    const library = new MaterialLibrary(() => Promise.reject(new Error('404')));
    library.register([spec('oak', { textureUrl: '/нет.webp' })]);

    const material = library.get('oak')!;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(material.map).toBeNull();
  });

  it('освобождает материалы и текстуры', () => {
    const library = new MaterialLibrary();
    library.register([spec('oak')]);
    const material = library.get('oak')!;

    let disposed = false;
    material.addEventListener('dispose', () => {
      disposed = true;
    });
    library.dispose();

    expect(disposed).toBe(true);
  });
});

describe('покрытия пола', () => {
  const floorSpec = {
    code: 'floor-laminate-oak',
    textureUrl: '/floor.webp',
    repeatMm: 1200,
    roughness: 0.7,
  };

  it('неизвестное покрытие материала не даёт', () => {
    expect(new MaterialLibrary().floor('нет такого')).toBeUndefined();
  });

  it('материал пола общий: повторный запрос отдаёт тот же', () => {
    const library = new MaterialLibrary(async () => new Texture());
    library.registerFloors([floorSpec]);

    expect(library.floor(floorSpec.code)).toBe(library.floor(floorSpec.code));
  });

  it('масштаб карты считается по физическому размеру квадрата', async () => {
    const library = new MaterialLibrary(async () => new Texture());
    library.registerFloors([floorSpec]);
    const material = library.floor(floorSpec.code)!;
    await Promise.resolve();
    await Promise.resolve();

    // Квадрат 1200 мм — примерно 0.83 повтора на метр
    expect(material.map?.repeat.x).toBeCloseTo(1000 / 1200, 4);
    expect(material.map?.repeat.y).toBeCloseTo(1000 / 1200, 4);
  });

  it('цвет базы белый: тон несёт текстура и перемножать его дважды нельзя', () => {
    const library = new MaterialLibrary(async () => new Texture());
    library.registerFloors([floorSpec]);

    expect(library.floor(floorSpec.code)!.color.getHex()).toBe(0xffffff);
  });

  it('материал пола помечен общим, чтобы реестр его не освободил', () => {
    const library = new MaterialLibrary(async () => new Texture());
    library.registerFloors([floorSpec]);

    expect(library.floor(floorSpec.code)!.userData['shared']).toBe(true);
  });
});

describe('подмена отделки', () => {
  it('меняет материал нужного слота', () => {
    const group = model(['oak', 'white', 'steel']);
    const graphite = new MeshStandardMaterial({ name: 'graphite' });

    applyFinishes(group, { oak: graphite });

    expect(meshMaterialNames(group)).toEqual(['graphite', 'white', 'steel']);
  });

  it('остальные слоты не трогает', () => {
    const group = model(['oak', 'steel']);
    const steelBefore = (group.children[1] as Mesh).material;

    applyFinishes(group, { oak: new MeshStandardMaterial({ name: 'white' }) });

    expect((group.children[1] as Mesh).material).toBe(steelBefore);
  });

  it('повторная смена находит слот по исходному имени', () => {
    // После первой подмены имя материала уже другое, и без памяти
    // о слоте вторая смена отделки не нашла бы меш
    const group = model(['oak']);
    applyFinishes(group, { oak: new MeshStandardMaterial({ name: 'white' }) });
    applyFinishes(group, { oak: new MeshStandardMaterial({ name: 'graphite' }) });

    expect(meshMaterialNames(group)).toEqual(['graphite']);
  });

  it('пустой выбор возвращает исходный материал', () => {
    const group = model(['oak']);
    const original = (group.children[0] as Mesh).material;

    applyFinishes(group, { oak: new MeshStandardMaterial({ name: 'white' }) });
    applyFinishes(group, {});

    expect((group.children[0] as Mesh).material).toBe(original);
  });

  it('модель без нужного слота не меняется', () => {
    const group = model(['steel']);
    applyFinishes(group, { oak: new MeshStandardMaterial({ name: 'white' }) });

    expect(meshMaterialNames(group)).toEqual(['steel']);
  });

  it('объекты без геометрии пропускаются', () => {
    const group = new Group();
    group.add(new Group());
    expect(() => applyFinishes(group, {})).not.toThrow();
  });
});
