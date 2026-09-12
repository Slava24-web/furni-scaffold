import { Box3, Mesh, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createRectangularRoom, type Room } from '@furni/shared';
import { RoomBuilder } from './RoomBuilder';

const room = (): Room => createRectangularRoom({ widthMm: 4000, depthMm: 3000, heightMm: 2700 });

const meshes = (builder: RoomBuilder): Mesh[] =>
  builder.root.children.filter((child): child is Mesh => (child as Mesh).isMesh);

describe('RoomBuilder', () => {
  it('строит по мешу на стену плюс пол', () => {
    const builder = new RoomBuilder(new Scene());
    builder.build([room()]);

    // Панели одной стены слиты в один меш: у комнаты с проёмами их два
    // десятка, по draw call на каждую бюджет не выдержит
    expect(meshes(builder)).toHaveLength(5);
    expect(meshes(builder).filter((m) => m.name.startsWith('wall:'))).toHaveLength(4);
    expect(meshes(builder).filter((m) => m.name === 'floor')).toHaveLength(1);
  });

  it('стены стоят на полу и не выше заданной высоты', () => {
    const builder = new RoomBuilder(new Scene());
    builder.build([room()]);

    const walls = meshes(builder).filter((m) => m.name.startsWith('wall:'));
    const box = new Box3();
    for (const wall of walls) box.union(new Box3().setFromObject(wall));
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(2.7, 5);
  });

  it('габарит помещения соответствует заказанному размеру', () => {
    const builder = new RoomBuilder(new Scene());
    builder.build([createRectangularRoom({ widthMm: 4000, depthMm: 3000, thicknessMm: 100 })]);

    const box = new Box3().setFromObject(builder.root);
    const size = box.getSize(new Vector3());
    // Осевые линии разнесены на половину толщины наружу от размера
    // в свету, стена расходится от оси ещё на половину в каждую сторону:
    // наружный габарит равен размеру в свету плюс две толщины
    expect(size.x).toBeCloseTo(4.2, 3);
    expect(size.z).toBeCloseTo(3.2, 3);
  });

  it('проём уменьшает объём кладки', () => {
    const plain = room();
    const withDoor: Room = {
      ...plain,
      openings: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          wallId: plain.walls[0]!.id,
          kind: 'door',
          offset: 1000,
          width: 900,
          height: 2100,
          sillHeight: 0,
          swingRadius: null,
  hinge: 'left' as const,
  swingInward: true,
  sku: null,
  options: {},
        },
      ],
    };

    const countVertices = (r: Room): number => {
      const builder = new RoomBuilder(new Scene());
      builder.build([r]);
      return meshes(builder)
        .filter((m) => m.name.startsWith('wall:'))
        .reduce((sum, mesh) => sum + mesh.geometry.getAttribute('position').count, 0);
    };

    // Дверь режет стену на простенок, перемычку и остаток: панелей
    // становится больше, но объём кладки меньше
    expect(countVertices(withDoor)).toBeGreaterThan(countVertices(plain));
  });

  it('пересборка не накапливает меши', () => {
    const builder = new RoomBuilder(new Scene());
    builder.build([room()]);
    builder.build([room()]);
    builder.build([createRectangularRoom({ widthMm: 6000, depthMm: 6000 })]);

    expect(meshes(builder)).toHaveLength(5);
  });

  it('пустой список комнат не оставляет геометрии', () => {
    const builder = new RoomBuilder(new Scene());
    builder.build([room()]);
    builder.build([]);

    expect(meshes(builder)).toHaveLength(0);
    expect(builder.isEmpty).toBe(true);
  });

  it('комната из двух стен не строит пол', () => {
    const partial: Room = { ...room(), walls: room().walls.slice(0, 2) };
    const builder = new RoomBuilder(new Scene());
    builder.build([partial]);

    expect(meshes(builder)).toHaveLength(2);
    expect(meshes(builder).every((m) => m.name.startsWith('wall:'))).toBe(true);
  });

  it('освобождает ресурсы и снимает себя со сцены', () => {
    const scene = new Scene();
    const builder = new RoomBuilder(scene);
    builder.build([room()]);

    const wall = meshes(builder).find((m) => m.name.startsWith('wall:'))!;
    let disposed = false;
    wall.geometry.addEventListener('dispose', () => {
      disposed = true;
    });

    builder.dispose();

    expect(disposed).toBe(true);
    expect(scene.children).not.toContain(builder.root);
  });

  describe('отсечение стен по стороне камеры', () => {
    const visibleWalls = (builder: RoomBuilder): number =>
      meshes(builder).filter((m) => m.name.startsWith('wall:') && m.visible).length;

    it('из центра комнаты видны все стены', () => {
      const builder = new RoomBuilder(new Scene());
      builder.build([room()]);
      builder.updateCulling(new Vector3(0, 1.6, 0));

      expect(visibleWalls(builder)).toBe(4);
    });

    it('снаружи ближняя стена скрывается', () => {
      const builder = new RoomBuilder(new Scene());
      builder.build([room()]);
      // Камера далеко по +Z: стена с этой стороны загораживает помещение
      builder.updateCulling(new Vector3(0, 3, 20));

      expect(visibleWalls(builder)).toBeLessThan(4);
      expect(visibleWalls(builder)).toBeGreaterThan(0);
    });

    it('из угла скрываются две стены', () => {
      const builder = new RoomBuilder(new Scene());
      builder.build([room()]);
      builder.updateCulling(new Vector3(20, 8, 20));

      expect(visibleWalls(builder)).toBe(2);
    });

    it('сообщает об изменении видимости только когда она изменилась', () => {
      const builder = new RoomBuilder(new Scene());
      builder.build([room()]);

      expect(builder.updateCulling(new Vector3(0, 3, 20))).toBe(true);
      // Повторный вызов из той же точки не должен просить новый кадр
      expect(builder.updateCulling(new Vector3(0, 3, 20))).toBe(false);
      expect(builder.updateCulling(new Vector3(0, 3, -20))).toBe(true);
    });
  });
});
