import { Box3, Mesh, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createRectangularRoom, type Room } from '@furni/shared';
import { RoomBuilder } from './RoomBuilder';

const room = (): Room => createRectangularRoom({ widthMm: 4000, depthMm: 3000, heightMm: 2700 });

const meshes = (builder: RoomBuilder): Mesh[] =>
  builder.root.children.filter((child): child is Mesh => (child as Mesh).isMesh);

describe('RoomBuilder', () => {
  it('строит ровно два меша: стены и пол', () => {
    const builder = new RoomBuilder(new Scene());
    builder.build([room()]);

    // Один draw call на все стены и один на пол: панелей у комнаты
    // с проёмами два десятка, по вызову на каждую бюджет не выдержит
    expect(meshes(builder)).toHaveLength(2);
    expect(meshes(builder).map((m) => m.name).sort()).toEqual(['floor', 'walls']);
  });

  it('стены стоят на полу и не выше заданной высоты', () => {
    const builder = new RoomBuilder(new Scene());
    builder.build([room()]);

    const walls = meshes(builder).find((m) => m.name === 'walls')!;
    const box = new Box3().setFromObject(walls);
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
        },
      ],
    };

    const countVertices = (r: Room): number => {
      const builder = new RoomBuilder(new Scene());
      builder.build([r]);
      const walls = meshes(builder).find((m) => m.name === 'walls')!;
      return walls.geometry.getAttribute('position').count;
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

    expect(meshes(builder)).toHaveLength(2);
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

    expect(meshes(builder).map((m) => m.name)).toEqual(['walls']);
  });

  it('освобождает ресурсы и снимает себя со сцены', () => {
    const scene = new Scene();
    const builder = new RoomBuilder(scene);
    builder.build([room()]);

    const walls = meshes(builder).find((m) => m.name === 'walls')!;
    let disposed = false;
    walls.geometry.addEventListener('dispose', () => {
      disposed = true;
    });

    builder.dispose();

    expect(disposed).toBe(true);
    expect(scene.children).not.toContain(builder.root);
  });
});
