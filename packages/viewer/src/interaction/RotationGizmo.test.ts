import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { RotationGizmo } from './RotationGizmo';

function object(width = 1, height = 0.8, depth = 0.6, x = 0, z = 0): Group {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), new MeshBasicMaterial());
  mesh.position.y = height / 2;
  const group = new Group();
  group.add(mesh);
  group.position.set(x, 0, z);
  group.updateMatrixWorld(true);
  return group;
}

describe('RotationGizmo', () => {
  it('добавляется в сцену скрытым', () => {
    const scene = new Scene();
    const gizmo = new RotationGizmo(scene);

    expect(scene.children).toContain(gizmo.mesh);
    expect(gizmo.visible).toBe(false);
  });

  it('показывается вокруг объекта и прячется по detach', () => {
    const gizmo = new RotationGizmo(new Scene());

    gizmo.attach(object());
    expect(gizmo.visible).toBe(true);

    gizmo.detach();
    expect(gizmo.visible).toBe(false);
  });

  it('встаёт по центру объекта в плане', () => {
    const gizmo = new RotationGizmo(new Scene());
    gizmo.attach(object(1, 0.8, 0.6, 2, -3));

    expect(gizmo.mesh.position.x).toBeCloseTo(2, 5);
    expect(gizmo.mesh.position.z).toBeCloseTo(-3, 5);
  });

  it('лежит у основания объекта, а не в его середине', () => {
    const gizmo = new RotationGizmo(new Scene());
    gizmo.attach(object(1, 2.2, 0.6));

    // Чуть выше нуля, чтобы не мерцать с полом
    expect(gizmo.mesh.position.y).toBeGreaterThan(0);
    expect(gizmo.mesh.position.y).toBeLessThan(0.05);
  });

  it('охватывает объект целиком с запасом', () => {
    const gizmo = new RotationGizmo(new Scene());
    const wide = object(2, 0.8, 0.6);
    gizmo.attach(wide);

    const ring = new Box3().setFromObject(gizmo.mesh).getSize(new Vector3());
    expect(ring.x).toBeGreaterThan(2);
  });

  it('следует за объектом при перемещении', () => {
    const gizmo = new RotationGizmo(new Scene());
    const target = object();
    gizmo.attach(target);

    target.position.set(4, 0, 1);
    target.updateMatrixWorld(true);
    gizmo.update(target);

    expect(gizmo.mesh.position.x).toBeCloseTo(4, 5);
    expect(gizmo.mesh.position.z).toBeCloseTo(1, 5);
  });

  it('не пересобирает геометрию, пока габарит не изменился', () => {
    const gizmo = new RotationGizmo(new Scene());
    const target = object();
    gizmo.attach(target);
    const geometry = gizmo.mesh.geometry;

    target.position.x = 3;
    target.updateMatrixWorld(true);
    gizmo.update(target);

    // Объект двигают на каждое событие указателя: пересборка кольца
    // в этом цикле означала бы постоянные выделения буферов GPU
    expect(gizmo.mesh.geometry).toBe(geometry);
  });

  it('пересобирает геометрию при смене габарита объекта', () => {
    const gizmo = new RotationGizmo(new Scene());
    gizmo.attach(object(1));
    const geometry = gizmo.mesh.geometry;

    gizmo.update(object(3));

    expect(gizmo.mesh.geometry).not.toBe(geometry);
  });

  it('пустой объект не роняет обновление', () => {
    const gizmo = new RotationGizmo(new Scene());
    expect(() => gizmo.update(new Group())).not.toThrow();
  });

  it('рисуется поверх мебели', () => {
    const gizmo = new RotationGizmo(new Scene());
    const material = gizmo.mesh.material as MeshBasicMaterial;

    expect(gizmo.mesh.renderOrder).toBeGreaterThan(0);
    expect(material.depthTest).toBe(false);
  });

  it('освобождает ресурсы и снимает себя со сцены', () => {
    const scene = new Scene();
    const gizmo = new RotationGizmo(scene);

    let disposed = false;
    gizmo.mesh.geometry.addEventListener('dispose', () => {
      disposed = true;
    });

    gizmo.dispose();

    expect(disposed).toBe(true);
    expect(scene.children).not.toContain(gizmo.mesh);
  });
});
