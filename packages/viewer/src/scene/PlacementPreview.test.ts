import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { PlacementPreview } from './PlacementPreview';

function model(): { group: Group; mesh: Mesh; original: MeshStandardMaterial } {
  const original = new MeshStandardMaterial();
  original.userData.shared = true;
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), original);
  const group = new Group();
  group.add(mesh);
  return { group, mesh, original };
}

describe('PlacementPreview', () => {
  it('до показа пуст', () => {
    const scene = new Scene();
    const preview = new PlacementPreview(scene);

    expect(preview.visible).toBe(false);
    expect(scene.children).toHaveLength(0);
  });

  it('показывает призрак в сцене', () => {
    const scene = new Scene();
    const preview = new PlacementPreview(scene);
    const { group } = model();

    preview.show(group);

    expect(preview.visible).toBe(true);
    expect(scene.children).toContain(group);
  });

  it('подменяет материал на полупрозрачный', () => {
    const scene = new Scene();
    const preview = new PlacementPreview(scene);
    const { group, mesh, original } = model();

    preview.show(group);

    expect(mesh.material).not.toBe(original);
    expect((mesh.material as MeshStandardMaterial).transparent).toBe(true);
  });

  it('не трогает общий материал кэша: остальные копии модели не станут призрачными', () => {
    const scene = new Scene();
    const preview = new PlacementPreview(scene);
    const { group, original } = model();

    preview.show(group);

    expect(original.transparent).toBe(false);
    expect(original.userData.shared).toBe(true);
  });

  it('ставит положение в миллиметрах и разворот в градусах', () => {
    const scene = new Scene();
    const preview = new PlacementPreview(scene);
    const { group } = model();

    preview.show(group);
    preview.setTransform(-1691, 1450, 398, 90);

    expect(group.position.x).toBeCloseTo(-1.691, 6);
    expect(group.position.y).toBeCloseTo(1.45, 6);
    expect(group.position.z).toBeCloseTo(0.398, 6);
    expect(group.rotation.y).toBeCloseTo(Math.PI / 2, 6);
  });

  it('без показанного призрака перенос ничего не ломает', () => {
    const preview = new PlacementPreview(new Scene());
    expect(() => preview.setTransform(100, 0, 100, 45)).not.toThrow();
  });

  it('конфликт меняет цвет призрака и возвращает обратно', () => {
    const scene = new Scene();
    const preview = new PlacementPreview(scene);
    const { group, mesh } = model();
    preview.show(group);

    const normal = (mesh.material as MeshStandardMaterial).color.getHex();
    preview.setConflict(true);
    expect((mesh.material as MeshStandardMaterial).color.getHex()).not.toBe(normal);

    preview.setConflict(false);
    expect((mesh.material as MeshStandardMaterial).color.getHex()).toBe(normal);
  });

  it('повторный показ заменяет прежний призрак, а не добавляет второй', () => {
    const scene = new Scene();
    const preview = new PlacementPreview(scene);

    preview.show(model().group);
    preview.show(model().group);

    expect(scene.children).toHaveLength(1);
  });

  it('скрытие снимает призрак со сцены', () => {
    const scene = new Scene();
    const preview = new PlacementPreview(scene);
    preview.show(model().group);

    preview.hide();

    expect(preview.visible).toBe(false);
    expect(scene.children).toHaveLength(0);
  });

  it('освобождение убирает и призрак, и материал', () => {
    const scene = new Scene();
    const preview = new PlacementPreview(scene);
    preview.show(model().group);

    preview.dispose();

    expect(scene.children).toHaveLength(0);
    expect(preview.visible).toBe(false);
  });
});
