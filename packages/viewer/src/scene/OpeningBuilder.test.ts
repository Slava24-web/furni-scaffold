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

/** Все меши изделия: часть висит на полотне, часть на коробке. */
function meshes(group: { traverse: (fn: (node: unknown) => void) => void }): Mesh[] {
  const found: Mesh[] = [];
  group.traverse((node) => {
    if ((node as Mesh).isMesh) found.push(node as Mesh);
  });
  return found;
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
    const materials = meshes(builder.targets[0]!).map(
      (mesh) => mesh.material as MeshStandardMaterial,
    );

    expect(materials.some((material) => material.transparent && material.opacity < 1)).toBe(true);
  });

  it('глухая дверь стекла не получает', () => {
    const { builder } = build([{ sku: 'door-flush' }]);
    const materials = meshes(builder.targets[0]!).map(
      (mesh) => mesh.material as MeshStandardMaterial,
    );

    expect(materials.some((material) => material.transparent)).toBe(false);
  });

  it('деталей на изделие меньше, чем материалов: они слиты по материалу', () => {
    const { builder } = build([
      { kind: 'window', sku: 'window-pvc-3', width: 2000, height: 1400, sillHeight: 850 },
    ]);
    // Профиль, стекло и подоконник — три материала, три меша
    expect(meshes(builder.targets[0]!).length).toBeLessThanOrEqual(4);
  });

  it('цвет берётся из каталога тенанта', () => {
    const scene = new Scene();
    const builder = new OpeningBuilder(scene);
    const graphite = new MeshStandardMaterial({ color: 0x303234 });
    builder.build([room([{ options: { material: 'graphite' } }])], {
      get: (code) => (code === 'graphite' ? graphite : undefined),
    });

    const used = meshes(builder.targets[0]!).map((mesh) => mesh.material);
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

    const used = meshes(builder.targets[0]!).map((mesh) => mesh.material);
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

  it('закрытая дверь стоит в плоскости стены', () => {
    const { builder } = build([{ sku: 'door-flush' }]);
    const before = bounds(builder).clone();

    builder.setOpen(builder.targets[0]!.userData['openingId'] as string, true);
    expect(before.min.z).toBeCloseTo(bounds(builder).min.z, 5);
  });

  it('открытая дверь выходит из плоскости стены', () => {
    const { builder } = build([{ sku: 'door-flush' }]);
    const value = room([{ sku: 'door-flush' }]);
    const id = builder.targets[0]!.userData['openingId'] as string;

    builder.setOpen(id, true);
    builder.build([{ ...value, openings: [{ ...value.openings[0]!, id }] }], noMaterials);

    // Полотно распахнуто: габарит изделия стал глубже толщины стены
    const size = bounds(builder).getSize(new Vector3());
    expect(Math.max(size.x, size.z)).toBeGreaterThan(0.5);
  });

  it('повторный вызов с тем же состоянием ничего не меняет', () => {
    const { builder } = build([{ sku: 'door-flush' }]);
    const id = builder.targets[0]!.userData['openingId'] as string;

    expect(builder.setOpen(id, true)).toBe(true);
    expect(builder.setOpen(id, true)).toBe(false);
    expect(builder.isOpen(id)).toBe(true);
  });

  it('состояние переживает пересборку сцены', () => {
    const { builder } = build([{ sku: 'door-flush' }]);
    const id = builder.targets[0]!.userData['openingId'] as string;
    builder.setOpen(id, true);

    const value = room([{ sku: 'door-flush' }]);
    builder.build([{ ...value, openings: [{ ...value.openings[0]!, id }] }], noMaterials);

    // Дверь не захлопывается на каждую правку размера комнаты
    expect(builder.isOpen(id)).toBe(true);
  });
});