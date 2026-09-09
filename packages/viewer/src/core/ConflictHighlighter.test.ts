import { BoxGeometry, Mesh, MeshBasicMaterial, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { ConflictHighlighter, MAX_HIGHLIGHTS } from './ConflictHighlighter';

const target = (): Mesh => new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
const targets = (count: number): Mesh[] => Array.from({ length: count }, target);

const helpers = (scene: Scene) => scene.children.filter((c) => c.type === 'Box3Helper');
const visible = (scene: Scene) => helpers(scene).filter((c) => c.visible);

describe('ConflictHighlighter', () => {
  it('без конфликтов ничего не показывает', () => {
    const scene = new Scene();
    const highlighter = new ConflictHighlighter(scene);

    highlighter.show([]);

    expect(highlighter.visibleCount).toBe(0);
    expect(visible(scene)).toHaveLength(0);
  });

  it('подсвечивает каждый конфликтующий объект', () => {
    const scene = new Scene();
    const highlighter = new ConflictHighlighter(scene);

    highlighter.show(targets(3));

    expect(highlighter.visibleCount).toBe(3);
    expect(visible(scene)).toHaveLength(3);
  });

  it('переиспользует рамки вместо создания новых', () => {
    const scene = new Scene();
    const highlighter = new ConflictHighlighter(scene);

    highlighter.show(targets(3));
    highlighter.show(targets(2));
    highlighter.show(targets(3));

    // Пул вырос до трёх и больше не растёт: создание Box3Helper на каждое
    // движение указателя означало бы выделение буферов GPU в горячем пути
    expect(helpers(scene)).toHaveLength(3);
    expect(highlighter.visibleCount).toBe(3);
  });

  it('лишние рамки прячутся, а не остаются висеть', () => {
    const scene = new Scene();
    const highlighter = new ConflictHighlighter(scene);

    highlighter.show(targets(4));
    highlighter.show(targets(1));

    expect(visible(scene)).toHaveLength(1);
    expect(helpers(scene)).toHaveLength(4);
  });

  it('очистка прячет всё', () => {
    const scene = new Scene();
    const highlighter = new ConflictHighlighter(scene);

    highlighter.show(targets(3));
    highlighter.clear();

    expect(highlighter.visibleCount).toBe(0);
    expect(visible(scene)).toHaveLength(0);
  });

  it('число рамок ограничено бюджетом draw calls', () => {
    const scene = new Scene();
    const highlighter = new ConflictHighlighter(scene);

    highlighter.show(targets(MAX_HIGHLIGHTS + 10));

    expect(highlighter.visibleCount).toBe(MAX_HIGHLIGHTS);
    expect(visible(scene)).toHaveLength(MAX_HIGHLIGHTS);
  });

  it('рисуется поверх мебели', () => {
    const scene = new Scene();
    const highlighter = new ConflictHighlighter(scene);
    highlighter.show(targets(1));

    const helper = helpers(scene)[0] as unknown as {
      renderOrder: number;
      material: { depthTest: boolean };
    };
    expect(helper.renderOrder).toBeGreaterThan(0);
    expect(helper.material.depthTest).toBe(false);
  });

  it('освобождает ресурсы и снимает рамки со сцены', () => {
    const scene = new Scene();
    const highlighter = new ConflictHighlighter(scene);
    highlighter.show(targets(2));

    const geometry = (helpers(scene)[0] as unknown as { geometry: { addEventListener: Function } })
      .geometry;
    let disposed = false;
    geometry.addEventListener('dispose', () => {
      disposed = true;
    });

    highlighter.dispose();

    expect(disposed).toBe(true);
    expect(helpers(scene)).toHaveLength(0);
  });
});
