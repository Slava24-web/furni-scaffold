import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { SceneRegistry } from './SceneRegistry';

function instance(material?: MeshStandardMaterial): { group: Group; mesh: Mesh } {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), material ?? new MeshStandardMaterial());
  const group = new Group();
  group.add(mesh);
  return { group, mesh };
}

describe('SceneRegistry', () => {
  it('находит владельца по вложенному мешу — raycast попадает в деталь, не в корень', () => {
    const registry = new SceneRegistry(new Scene());
    const { group, mesh } = instance();
    registry.add('i1', 'p1', group);

    expect(registry.resolve(mesh)?.instanceId).toBe('i1');
  });

  it('не даёт зарегистрировать один instanceId дважды', () => {
    const registry = new SceneRegistry(new Scene());
    registry.add('i1', 'p1', instance().group);

    expect(() => registry.add('i1', 'p1', instance().group)).toThrowError(/уже зарегистрирован/);
  });

  it('освобождает собственные ресурсы инстанса при удалении', () => {
    const scene = new Scene();
    const registry = new SceneRegistry(scene);
    const { group, mesh } = instance();
    registry.add('i1', 'p1', group);

    let geometryDisposed = false;
    mesh.geometry.addEventListener('dispose', () => {
      geometryDisposed = true;
    });

    registry.remove('i1');

    expect(geometryDisposed).toBe(true);
    expect(scene.children).not.toContain(group);
    expect(registry.get('i1')).toBeUndefined();
  });

  it('не трогает ресурсы, помеченные shared: их владелец — кэш загрузчика', () => {
    const registry = new SceneRegistry(new Scene());

    // AssetLoader отдаёт clone(true): геометрия и материал общие с кэшем
    // и остальными клонами. Освободить их при удалении одного инстанса —
    // значит обнулить модель у всех.
    const sharedMaterial = new MeshStandardMaterial();
    sharedMaterial.userData.shared = true;
    const sharedGeometry = new BoxGeometry(1, 1, 1);
    sharedGeometry.userData.shared = true;

    const first = new Group();
    first.add(new Mesh(sharedGeometry, sharedMaterial));
    const second = new Group();
    second.add(new Mesh(sharedGeometry, sharedMaterial));

    registry.add('i1', 'p1', first);
    registry.add('i2', 'p1', second);

    let disposed = false;
    sharedGeometry.addEventListener('dispose', () => {
      disposed = true;
    });
    sharedMaterial.addEventListener('dispose', () => {
      disposed = true;
    });

    registry.remove('i1');

    expect(disposed).toBe(false);
    expect(registry.get('i2')).toBeDefined();
  });
});
