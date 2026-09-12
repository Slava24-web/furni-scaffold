import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { DrawerController, drawersOf, travelOf } from './DrawerController';

/** Модель с ящиками: корпус и подвижные узлы, как их отдаёт загрузчик. */
function model(travelMm = 300, count = 2): Group {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));

  for (let index = 0; index < count; index++) {
    const drawer = new Object3D();
    drawer.name = `drawer:${index}`;
    drawer.userData['travelMm'] = travelMm;
    drawer.add(new Mesh(new BoxGeometry(1, 0.2, 0.5), new MeshStandardMaterial()));
    root.add(drawer);
  }
  return root;
}

/** Прогон анимации до конца. */
function settle(controller: DrawerController): void {
  for (let i = 0; i < 40 && controller.busy; i++) controller.update(0.016);
}

describe('выдвижные ящики', () => {
  it('находит узлы ящиков в модели', () => {
    expect(drawersOf(model())).toHaveLength(2);
  });

  it('узнаёт ящик по вычищенному загрузчиком имени', () => {
    // glTF-загрузчик убирает двоеточия из имён узлов: drawer:0 -> drawer0,
    // а исходное имя кладёт в userData
    const root = new Group();
    const drawer = new Object3D();
    drawer.name = 'drawer0';
    drawer.userData['name'] = 'drawer:0';
    drawer.userData['travelMm'] = 300;
    root.add(drawer);

    expect(drawersOf(root)).toEqual([drawer]);
  });

  it('узел без записанного хода ящиком не считается', () => {
    const root = model();
    const broken = new Object3D();
    broken.name = 'drawer:9';
    root.add(broken);

    expect(drawersOf(root)).toHaveLength(2);
    expect(travelOf(broken)).toBe(0);
  });

  it('выдвигает ящик ровно на записанный ход', () => {
    const controller = new DrawerController();
    const [drawer] = drawersOf(model(300));

    expect(controller.toggle(drawer!)).toBe(true);
    settle(controller);

    expect(drawer!.position.z).toBeCloseTo(0.3, 4);
  });

  it('повторный тап возвращает ящик на место', () => {
    const controller = new DrawerController();
    const [drawer] = drawersOf(model(300));

    controller.toggle(drawer!);
    settle(controller);
    expect(controller.toggle(drawer!)).toBe(false);
    settle(controller);

    expect(drawer!.position.z).toBeCloseTo(0, 5);
    expect(controller.isOpen(drawer!)).toBe(false);
  });

  it('переключение на полпути идёт от текущего положения, а не рывком', () => {
    const controller = new DrawerController();
    const [drawer] = drawersOf(model(300));

    controller.toggle(drawer!);
    controller.update(0.1);
    const half = drawer!.position.z;
    controller.toggle(drawer!);
    controller.update(0.016);

    expect(half).toBeGreaterThan(0);
    expect(drawer!.position.z).toBeLessThan(half);
  });

  it('ящики двигаются независимо', () => {
    const controller = new DrawerController();
    const [first, second] = drawersOf(model(300));

    controller.toggle(first!);
    settle(controller);

    expect(first!.position.z).toBeCloseTo(0.3, 4);
    expect(second!.position.z).toBe(0);
  });

  it('без движения кадры не запрашиваются', () => {
    const controller = new DrawerController();
    expect(controller.update(0.016)).toBe(false);
  });

  it('пока ящик едет, кадры запрашиваются каждый', () => {
    const controller = new DrawerController();
    const [drawer] = drawersOf(model(300));
    controller.toggle(drawer!);

    expect(controller.update(0.016)).toBe(true);
  });

  it('закрывает все ящики модели разом', () => {
    const controller = new DrawerController();
    const root = model(300);
    const drawers = drawersOf(root);
    for (const drawer of drawers) controller.toggle(drawer);
    settle(controller);

    controller.closeAll(root);
    settle(controller);

    expect(drawers.every((drawer) => drawer.position.z === 0)).toBe(true);
  });

  it('узел без хода не двигается', () => {
    const controller = new DrawerController();
    const stub = new Object3D();
    stub.name = 'drawer:0';

    expect(controller.toggle(stub)).toBe(false);
    expect(controller.busy).toBe(false);
  });
});
