import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { DoorController, doorAngleOf, doorsOf } from './DoorController';

/** Модель с дверцами: корпус и подвижные узлы, как их отдаёт загрузчик. */
function model(angleDeg = 100, count = 2): Group {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));

  for (let index = 0; index < count; index++) {
    const door = new Object3D();
    door.name = `door${index}`;
    door.userData['name'] = `door:${index}`;
    door.userData['maxAngleDeg'] = angleDeg;
    door.userData['hingeXMm'] = -300;
    door.userData['hingeZMm'] = 280;
    door.add(new Mesh(new BoxGeometry(0.6, 0.7, 0.02), new MeshStandardMaterial()));
    root.add(door);
  }
  return root;
}

function settle(controller: DoorController): void {
  for (let i = 0; i < 60 && controller.busy; i++) controller.update(0.016);
}

describe('распашные дверцы', () => {
  it('находит узлы дверец', () => {
    expect(doorsOf(model())).toHaveLength(2);
  });

  it('узел без угла распахивания дверцей не считается', () => {
    const root = model();
    const stub = new Object3D();
    stub.name = 'door9';
    root.add(stub);

    expect(doorsOf(root)).toHaveLength(2);
    expect(doorAngleOf(stub)).toBe(0);
  });

  it('открывает дверцу на записанный угол', () => {
    const controller = new DoorController();
    const [door] = doorsOf(model(100));

    expect(controller.toggle(door!)).toBe(true);
    settle(controller);

    const pivot = door!.parent!;
    expect((pivot.rotation.y * 180) / Math.PI).toBeCloseTo(100, 2);
  });

  it('поворачивает вокруг петли, а не вокруг центра', () => {
    const controller = new DoorController();
    const [door] = doorsOf(model());
    controller.toggle(door!);

    const pivot = door!.parent!;
    // Обёртка стоит в точке навески, дверца сдвинута на столько же
    expect(pivot.position.x).toBeCloseTo(-0.3, 6);
    expect(pivot.position.z).toBeCloseTo(0.28, 6);
    expect(door!.position.x).toBeCloseTo(0.3, 6);
  });

  it('повторный тап закрывает', () => {
    const controller = new DoorController();
    const [door] = doorsOf(model());

    controller.toggle(door!);
    settle(controller);
    expect(controller.toggle(door!)).toBe(false);
    settle(controller);

    expect(door!.parent!.rotation.y).toBeCloseTo(0, 5);
    expect(controller.isOpen(door!)).toBe(false);
  });

  it('дверцы открываются независимо', () => {
    const controller = new DoorController();
    const [first, second] = doorsOf(model());

    controller.toggle(first!);
    settle(controller);

    expect(controller.isOpen(first!)).toBe(true);
    expect(controller.isOpen(second!)).toBe(false);
  });

  it('отрицательный угол распахивает в другую сторону', () => {
    const controller = new DoorController();
    const [door] = doorsOf(model(-110));
    controller.toggle(door!);
    settle(controller);

    expect(door!.parent!.rotation.y).toBeLessThan(0);
  });

  it('открыть все разом', () => {
    const controller = new DoorController();
    const root = model();
    controller.setAll(root, true);
    settle(controller);

    expect(doorsOf(root).every((door) => controller.isOpen(door))).toBe(true);
  });

  it('закрыть все разом', () => {
    const controller = new DoorController();
    const root = model();
    controller.setAll(root, true);
    settle(controller);
    controller.setAll(root, false);
    settle(controller);

    expect(doorsOf(root).some((door) => controller.isOpen(door))).toBe(false);
  });

  it('без движения кадры не запрашиваются', () => {
    expect(new DoorController().update(0.016)).toBe(false);
  });

  it('узел без родителя не роняет поворот', () => {
    const controller = new DoorController();
    const orphan = new Object3D();
    orphan.name = 'door0';
    orphan.userData['maxAngleDeg'] = 90;

    expect(controller.toggle(orphan)).toBe(false);
  });
});
