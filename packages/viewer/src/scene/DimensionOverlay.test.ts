import { PerspectiveCamera, Raycaster, Scene, Sprite, Vector2 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DimensionOverlay } from './DimensionOverlay';
import { createRectangularRoom, roomDimensions, type WallDimension } from '@furni/shared';

/** В тестовой среде DOM нет, подпись рисовать нечем: фабрика заглушается. */
const noLabel = () => null;

function dimensions(): WallDimension[] {
  return roomDimensions(createRectangularRoom({ widthMm: 4000, depthMm: 3200 }));
}

function overlay(): { scene: Scene; overlay: DimensionOverlay } {
  const scene = new Scene();
  return { scene, overlay: new DimensionOverlay(scene, noLabel) };
}

describe('DimensionOverlay', () => {
  it('до сборки в сцене только пустая группа', () => {
    const { scene, overlay: view } = overlay();
    expect(scene.children).toContain(view.root);
    expect(view.root.children).toHaveLength(0);
  });

  it('на каждый размер приходится подпись', () => {
    const { overlay: view } = overlay();
    view.build(dimensions());

    expect(view.root.children.filter((child) => child instanceof Sprite)).toHaveLength(4);
  });

  it('подпись стоит там же, где точка подписи размера', () => {
    const { overlay: view } = overlay();
    const [first] = dimensions();
    view.build([first!]);

    const sprite = view.root.children.find((child) => child instanceof Sprite) as Sprite;
    expect(sprite.position.x).toBeCloseTo(first!.labelAt.x / 1000, 5);
    expect(sprite.position.z).toBeCloseTo(first!.labelAt.y / 1000, 5);
  });

  it('пересборка не копит объекты', () => {
    const { overlay: view } = overlay();
    view.build(dimensions());
    const before = view.root.children.length;
    view.build(dimensions());

    expect(view.root.children).toHaveLength(before);
  });

  it('пустой список очищает сцену: убранная планировка не оставляет размеров', () => {
    const { overlay: view } = overlay();
    view.build(dimensions());
    view.build([]);

    expect(view.root.children).toHaveLength(0);
    expect(view.targets).toHaveLength(0);
  });

  it('луч по подписи находит стену', () => {
    const { overlay: view } = overlay();
    const [first] = dimensions();
    view.build([first!]);

    const sprite = view.targets[0]!;
    // Спрайт разворачивается к камере, поэтому попадание в него
    // осмысленно только вместе с настоящей камерой
    const camera = new PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(sprite.position.x, 3, sprite.position.z);
    camera.lookAt(sprite.position);
    camera.updateMatrixWorld(true);
    view.root.updateMatrixWorld(true);

    const raycaster = new Raycaster();
    raycaster.setFromCamera(new Vector2(0, 0), camera);
    const hit = raycaster.intersectObjects(view.targets, false)[0];

    expect(hit && view.resolve(hit.object)).toEqual({
      id: first!.id,
      lengthMm: first!.clearLengthMm,
    });
  });

  it('неправимый размер не ловит луч: он не должен съедать тап по объекту', () => {
    const { overlay: view } = overlay();
    const [first] = dimensions();
    view.build([{ ...first!, editable: false }]);

    expect(view.root.children.filter((child) => child instanceof Sprite)).toHaveLength(1);
    expect(view.targets).toHaveLength(0);
  });

  it('текст подписи — размер в свету', () => {
    const scene = new Scene();
    const make = vi.fn(() => null);
    const view = new DimensionOverlay(scene, make);
    const [first] = dimensions();
    view.build([first!]);

    expect(make).toHaveBeenCalledWith(String(first!.clearLengthMm), true);
  });

  it('скрытие прячет всю группу', () => {
    const { overlay: view } = overlay();
    view.build(dimensions());
    view.setVisible(false);

    expect(view.visible).toBe(false);
    expect(view.root.visible).toBe(false);
  });

  it('dispose убирает группу из сцены', () => {
    const { scene, overlay: view } = overlay();
    view.build(dimensions());
    view.dispose();

    expect(scene.children).not.toContain(view.root);
  });
});
