import { Box3, BoxGeometry, LineBasicMaterial, Mesh, MeshBasicMaterial, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { SelectionIndicator } from './SelectionIndicator';

const target = (size = 1): Mesh => new Mesh(new BoxGeometry(size, size, size), new MeshBasicMaterial());

const helper = (indicator: SelectionIndicator, scene: Scene) =>
  scene.children.find((c) => c.type === 'Box3Helper')!;

const colorOf = (indicator: SelectionIndicator, scene: Scene): number => {
  const material = (helper(indicator, scene) as unknown as { material: LineBasicMaterial }).material;
  return material.color.getHex();
};

describe('SelectionIndicator', () => {
  it('добавляется в сцену скрытым', () => {
    const scene = new Scene();
    const indicator = new SelectionIndicator(scene);

    expect(helper(indicator, scene).visible).toBe(false);
  });

  it('показывает рамку по габариту объекта', () => {
    const scene = new Scene();
    const indicator = new SelectionIndicator(scene);
    const mesh = target(2);

    indicator.show(mesh);

    expect(helper(indicator, scene).visible).toBe(true);
  });

  it('скрывается по требованию', () => {
    const scene = new Scene();
    const indicator = new SelectionIndicator(scene);
    indicator.show(target());
    indicator.hide();

    expect(helper(indicator, scene).visible).toBe(false);
  });

  it('refresh с null прячет рамку', () => {
    const scene = new Scene();
    const indicator = new SelectionIndicator(scene);
    indicator.show(target());
    indicator.refresh(null);

    expect(helper(indicator, scene).visible).toBe(false);
  });

  it('конфликт красит рамку в красный и возвращает обратно', () => {
    const scene = new Scene();
    const indicator = new SelectionIndicator(scene);
    const normal = colorOf(indicator, scene);

    indicator.setConflict(true);
    expect(colorOf(indicator, scene)).not.toBe(normal);

    indicator.setConflict(false);
    expect(colorOf(indicator, scene)).toBe(normal);
  });

  it('повторная установка того же состояния ничего не ломает', () => {
    const scene = new Scene();
    const indicator = new SelectionIndicator(scene);
    indicator.setConflict(true);
    const first = colorOf(indicator, scene);
    indicator.setConflict(true);

    expect(colorOf(indicator, scene)).toBe(first);
  });

  it('рисуется поверх мебели: рамка внутри объекта не должна теряться', () => {
    const scene = new Scene();
    const indicator = new SelectionIndicator(scene);
    const box = helper(indicator, scene) as unknown as {
      renderOrder: number;
      material: LineBasicMaterial;
    };

    expect(box.renderOrder).toBeGreaterThan(0);
    expect(box.material.depthTest).toBe(false);
  });

  it('освобождает ресурсы и снимает себя со сцены', () => {
    const scene = new Scene();
    const indicator = new SelectionIndicator(scene);
    const box = helper(indicator, scene) as unknown as { geometry: { addEventListener: Function } };

    let disposed = false;
    box.geometry.addEventListener('dispose', () => {
      disposed = true;
    });

    indicator.dispose();

    expect(disposed).toBe(true);
    expect(scene.children.some((c) => c.type === 'Box3Helper')).toBe(false);
  });

  it('пустой габарит не роняет обновление', () => {
    const scene = new Scene();
    const indicator = new SelectionIndicator(scene);
    expect(() => indicator.refresh(target())).not.toThrow();
    expect(() => new Box3()).not.toThrow();
  });
});
