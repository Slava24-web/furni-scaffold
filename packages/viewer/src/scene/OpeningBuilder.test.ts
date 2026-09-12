import { Box3, Mesh, MeshStandardMaterial, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { OpeningBuilder } from './OpeningBuilder';
import {
  createRectangularRoom,
  openingStyle,
  randomUUID,
  type Opening,
  type Room,
} from '@furni/shared';

/** Материалы тенанта в тестах не нужны: цвет проверяется отдельно. */
const noMaterials = { get: () => undefined };

function room(openings: Partial<Opening>[]): Room {
  const base = createRectangularRoom({ widthMm: 4000, depthMm: 3200 });
  return {
    ...base,
    openings: openings.map((over) => ({
      id: randomUUID(),
      wallId: base.walls[0]!.id,
      kind: 'door',
      offset: 900,
      width: 800,
      height: 2000,
      sillHeight: 0,
      swingRadius: null,
      hinge: 'left',
      swingInward: true,
      sku: 'door-flush',
      options: {},
      ...over,
    })),
  };
}

function build(openings: Partial<Opening>[]): { builder: OpeningBuilder; scene: Scene } {
  const scene = new Scene();
  const builder = new OpeningBuilder(scene);
  builder.build([room(openings)], noMaterials);
  return { builder, scene };
}

/** Габарит изделия в проёме, метры мира. */
function bounds(builder: OpeningBuilder): Box3 {
  const group = builder.targets[0]!;
  group.updateMatrixWorld(true);
  return new Box3().setFromObject(group);
}

describe('OpeningBuilder', () => {
  it('голый проём изделия не получает', () => {
    const { builder } = build([{ sku: null }]);
    expect(builder.targets).toHaveLength(0);
  });

  it('неизвестное изделие пропускается молча', () => {
    const { builder } = build([{ sku: 'door-unknown' }]);
    expect(builder.targets).toHaveLength(0);
  });

  it('на каждый проём приходится своя группа', () => {
    const { builder } = build([{}, { offset: 2200 }]);
    expect(builder.targets).toHaveLength(2);
  });

  it('изделие адресуется проёмом: тап по любой детали находит его', () => {
    const { builder } = build([{}]);
    const group = builder.targets[0]!;
    const part = group.children[0]!;

    expect(builder.resolve(part)).toBe(group.userData['openingId']);
  });

  it('дверь занимает проём по ширине и высоте', () => {
    const { builder } = build([{ width: 800, height: 2000 }]);
    const size = bounds(builder).getSize(new Vector3());

    // Ручка выступает из плоскости полотна, поэтому проверяются
    // только габариты в плоскости стены
    expect(size.x).toBeCloseTo(0.8, 2);
    expect(size.y).toBeCloseTo(2.0, 2);
  });

  it('дверь стоит на полу, окно поднято на свою отметку', () => {
    const { builder: door } = build([{ kind: 'door', sku: 'door-flush', sillHeight: 0 }]);
    expect(bounds(door).min.y).toBeCloseTo(0, 3);

    const { builder: window } = build([
      { kind: 'window', sku: 'window-pvc-2', sillHeight: 850, height: 1400, width: 1300 },
    ]);
    // Подоконник опущен ниже проёма, поэтому низ чуть меньше отметки
    expect(bounds(window).min.y).toBeGreaterThan(0.75);
  });

  it('остеклённое изделие получает прозрачное заполнение', () => {
    const { builder } = build([{ kind: 'window', sku: 'window-pvc-2', width: 1300, height: 1400, sillHeight: 850 }]);
    const materials = builder.targets[0]!.children.map(
      (child) => (child as Mesh).material as MeshStandardMaterial,
    );

    expect(materials.some((material) => material.transparent && material.opacity < 1)).toBe(true);
  });

  it('глухая дверь стекла не получает', () => {
    const { builder } = build([{ sku: 'door-flush' }]);
    const materials = builder.targets[0]!.children.map(
      (child) => (child as Mesh).material as MeshStandardMaterial,
    );

    expect(materials.some((material) => material.transparent)).toBe(false);
  });

  it('деталей на изделие меньше, чем материалов: они слиты по материалу', () => {
    const { builder } = build([
      { kind: 'window', sku: 'window-pvc-3', width: 2000, height: 1400, sillHeight: 850 },
    ]);
    // Профиль, стекло и подоконник — три материала, три меша
    expect(builder.targets[0]!.children.length).toBeLessThanOrEqual(3);
  });

  it('цвет берётся из каталога тенанта', () => {
    const scene = new Scene();
    const builder = new OpeningBuilder(scene);
    const graphite = new MeshStandardMaterial({ color: 0x303234 });
    builder.build([room([{ options: { material: 'graphite' } }])], {
      get: (code) => (code === 'graphite' ? graphite : undefined),
    });

    const used = builder.targets[0]!.children.map((child) => (child as Mesh).material);
    expect(used).toContain(graphite);
  });

  it('материал вне ряда изделия игнорируется', () => {
    const style = openingStyle('door-flush')!;
    expect(style.materials).not.toContain('stone');

    const scene = new Scene();
    const builder = new OpeningBuilder(scene);
    const stone = new MeshStandardMaterial();
    builder.build([room([{ options: { material: 'stone' } }])], {
      get: (code) => (code === 'stone' ? stone : undefined),
    });

    const used = builder.targets[0]!.children.map((child) => (child as Mesh).material);
    expect(used).not.toContain(stone);
  });

  it('подсветка места показывает прямоугольник проёма', () => {
    const scene = new Scene();
    const builder = new OpeningBuilder(scene);
    const value = room([]);

    builder.previewAt(value, value.walls[0]!, {
      offsetMm: 500,
      widthMm: 900,
      heightMm: 2000,
      sillMm: 0,
    });
    const preview = builder.root.children.find((child) => child instanceof Mesh) as Mesh;
    preview.updateMatrixWorld(true);
    const size = new Box3().setFromObject(preview).getSize(new Vector3());

    expect(size.y).toBeCloseTo(2.0, 2);
    expect(Math.max(size.x, size.z)).toBeCloseTo(0.9, 2);
  });

  it('подсветка снимается пустым вызовом', () => {
    const scene = new Scene();
    const builder = new OpeningBuilder(scene);
    const value = room([]);
    builder.previewAt(value, value.walls[0]!, {
      offsetMm: 500,
      widthMm: 900,
      heightMm: 2000,
      sillMm: 0,
    });
    builder.previewAt(null, null, null);

    expect(builder.root.children).toHaveLength(0);
  });

  it('пересборка не копит объекты', () => {
    const { builder } = build([{}, { offset: 2200 }]);
    const value = room([{}, { offset: 2200 }]);
    builder.build([value], noMaterials);

    expect(builder.root.children).toHaveLength(2);
  });

  it('dispose убирает группу из сцены', () => {
    const { builder, scene } = build([{}]);
    builder.dispose();

    expect(scene.children).not.toContain(builder.root);
  });
});
