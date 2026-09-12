import { Line, Mesh, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { SwingOverlay } from './SwingOverlay';
import {
  createRectangularRoom,
  drawerZone,
  randomUUID,
  swingZones,
  type Opening,
  type Room,
} from '@furni/shared';

function roomWithDoors(count: number): Room {
  const room = createRectangularRoom({ widthMm: 4000, depthMm: 3200 });
  const openings: Opening[] = Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    wallId: room.walls[index % room.walls.length]!.id,
    kind: 'door',
    offset: 800,
    width: 900,
    height: 2100,
    sillHeight: 0,
    swingRadius: null,
    hinge: 'left',
    swingInward: true,
    sku: null,
    options: {},
  }));
  return { ...room, openings };
}

describe('SwingOverlay', () => {
  it('до сборки в сцене только пустая группа', () => {
    const scene = new Scene();
    const overlay = new SwingOverlay(scene);

    expect(scene.children).toContain(overlay.root);
    expect(overlay.root.children).toHaveLength(0);
  });

  it('на каждую дверь приходится контур и заливка', () => {
    const overlay = new SwingOverlay(new Scene());
    overlay.build(swingZones(roomWithDoors(2)));

    expect(overlay.root.children.filter((child) => child instanceof Line)).toHaveLength(2);
    expect(overlay.root.children.filter((child) => child instanceof Mesh)).toHaveLength(2);
  });

  it('сектор лежит на полу, а не висит', () => {
    const overlay = new SwingOverlay(new Scene());
    overlay.build(swingZones(roomWithDoors(1)));

    const mesh = overlay.root.children.find((child) => child instanceof Mesh) as Mesh;
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      expect(positions.getY(i)).toBeLessThan(0.05);
    }
  });

  it('пересборка не копит объекты', () => {
    const overlay = new SwingOverlay(new Scene());
    overlay.build(swingZones(roomWithDoors(2)));
    overlay.build(swingZones(roomWithDoors(2)));

    expect(overlay.root.children).toHaveLength(4);
  });

  it('убранная планировка не оставляет секторов', () => {
    const overlay = new SwingOverlay(new Scene());
    overlay.build(swingZones(roomWithDoors(2)));
    overlay.build([]);

    expect(overlay.root.children).toHaveLength(0);
  });

  it('скрытие прячет всю группу', () => {
    const overlay = new SwingOverlay(new Scene());
    overlay.build(swingZones(roomWithDoors(1)));
    overlay.setVisible(false);

    expect(overlay.visible).toBe(false);
  });

  it('dispose убирает группу из сцены', () => {
    const scene = new Scene();
    const overlay = new SwingOverlay(scene);
    overlay.build(swingZones(roomWithDoors(1)));
    overlay.dispose();

    expect(scene.children).not.toContain(overlay.root);
  });

  it('зона выдвижения рисуется рядом с секторами дверей', () => {
    const overlay = new SwingOverlay(new Scene());
    const zone = drawerZone(
      { position: { x: 0, y: 0, z: 0 }, rotationY: 0 },
      { widthMm: 600, depthMm: 560, heightMm: 820, drawerCount: 3, drawerTravelMm: 360 },
    )!;

    overlay.build(swingZones(roomWithDoors(1)), [zone]);

    // Дверь и ящик дают по контуру и заливке
    expect(overlay.root.children.filter((child) => child instanceof Line)).toHaveLength(2);
    expect(overlay.root.children.filter((child) => child instanceof Mesh)).toHaveLength(2);
  });

  it('без выделения зон выдвижения нет', () => {
    const overlay = new SwingOverlay(new Scene());
    overlay.build(swingZones(roomWithDoors(1)));

    expect(overlay.root.children).toHaveLength(2);
  });
});