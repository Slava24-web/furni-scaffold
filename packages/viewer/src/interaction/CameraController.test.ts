import { PerspectiveCamera, Vector2, Vector3 } from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { CameraController, DEFAULT_LIMITS } from './CameraController';

function makeController(): { camera: PerspectiveCamera; controller: CameraController } {
  const camera = new PerspectiveCamera(50, 16 / 9, 0.05, 200);
  camera.position.set(4, 3, 4);
  const controller = new CameraController(camera);
  controller.setViewport(1600, 900);
  return { camera, controller };
}

describe('CameraController', () => {
  let camera: PerspectiveCamera;
  let controller: CameraController;

  beforeEach(() => {
    ({ camera, controller } = makeController());
  });

  it('сохраняет дистанцию до точки интереса при орбите', () => {
    const before = controller.distance;
    controller.orbit(220, 90);
    expect(controller.distance).toBeCloseTo(before, 6);
  });

  it('не опускает камеру ниже пола', () => {
    // Тянем вниз заведомо сильнее предела
    controller.orbit(0, -5000);
    expect(camera.position.y).toBeGreaterThan(0);
  });

  it('не переворачивает камеру через зенит', () => {
    controller.orbit(0, 5000);
    expect(camera.position.y).toBeGreaterThan(0);
    expect(camera.up.y).toBe(1);
  });

  it('зум ограничен сверху и снизу', () => {
    controller.zoom(1000);
    expect(controller.distance).toBeCloseTo(DEFAULT_LIMITS.minDistance, 5);

    controller.zoom(0.00001);
    expect(controller.distance).toBeCloseTo(DEFAULT_LIMITS.maxDistance, 5);
  });

  it('игнорирует нулевой и отрицательный масштаб пинча', () => {
    const before = controller.distance;
    controller.zoom(0);
    controller.zoom(-2);
    expect(controller.distance).toBe(before);
  });

  it('панорама двигает точку интереса по полу, не меняя высоту', () => {
    const heightBefore = controller.target.y;
    controller.pan(120, 60);

    expect(controller.target.y).toBeCloseTo(heightBefore, 6);
    expect(new Vector2(controller.target.x, controller.target.z).length()).toBeGreaterThan(0);
  });

  it('панорама не уводит сцену за предел', () => {
    for (let i = 0; i < 200; i++) controller.pan(500, 500);
    const radius = new Vector2(controller.target.x, controller.target.z).length();
    expect(radius).toBeLessThanOrEqual(DEFAULT_LIMITS.maxTargetRadius + 1e-6);
  });

  it('mmPerPixel растёт с отдалением камеры', () => {
    const near = controller.mmPerPixel;
    controller.zoom(0.25);
    expect(controller.mmPerPixel).toBeGreaterThan(near);
  });

  it('mmPerPixel обратно пропорционален высоте вьюпорта', () => {
    const tall = controller.mmPerPixel;
    controller.setViewport(1600, 450);
    expect(controller.mmPerPixel).toBeCloseTo(tall * 2, 4);
  });

  it('центр экрана проецируется на пол по направлению взгляда', () => {
    // Точка интереса поднята над полом, поэтому луч через центр экрана
    // пробивает пол ДАЛЬШЕ неё, а не ровно в ней. Проверяем, что попадание
    // лежит на продолжении взгляда, а не сбоку.
    const hit = controller.projectToFloor(new Vector2(0, 0));
    expect(hit).not.toBeNull();
    expect(hit!.y).toBeCloseTo(0, 6);

    const view = controller.target.clone().sub(camera.position).setY(0).normalize();
    const toHit = hit!.clone().sub(camera.position).setY(0).normalize();
    expect(view.dot(toHit)).toBeCloseTo(1, 4);
  });

  it('проекция экрана на пол всегда лежит в плоскости пола', () => {
    for (const point of [new Vector2(-0.9, -0.9), new Vector2(0.9, -0.5), new Vector2(0, -0.2)]) {
      const hit = controller.projectToFloor(point);
      expect(hit).not.toBeNull();
      expect(hit!.y).toBeCloseTo(0, 6);
    }
  });

  it('перевод пикселей в NDC даёт -1..1 с инверсией оси Y', () => {
    expect(controller.toNdc(800, 450).toArray()).toEqual([0, 0]);
    expect(controller.toNdc(0, 0).toArray()).toEqual([-1, 1]);
    expect(controller.toNdc(1600, 900).toArray()).toEqual([1, -1]);
  });

  it('frame вписывает сцену: дальше радиуса, но в пределах лимита', () => {
    controller.frame(6);
    expect(controller.distance).toBeGreaterThan(6);
    expect(controller.distance).toBeLessThanOrEqual(DEFAULT_LIMITS.maxDistance);
  });

  it('камера всегда смотрит в точку интереса', () => {
    controller.orbit(150, 40);
    controller.pan(30, -20);

    const forward = controller.target.clone().sub(camera.position).normalize();
    const looking = camera.getWorldDirection(new Vector3());
    expect(forward.dot(looking)).toBeCloseTo(1, 5);
  });

  describe('проекция на горизонтальную плоскость', () => {
    it('на нулевой высоте совпадает с проекцией на пол', () => {
      const ndc = new Vector2(0.2, -0.3);
      const floor = controller.projectToFloor(ndc)!;
      const plane = controller.projectToPlane(ndc, 0)!;

      expect(plane.x).toBeCloseTo(floor.x, 9);
      expect(plane.z).toBeCloseTo(floor.z, 9);
    });

    it('попадание лежит на заданной высоте', () => {
      const hit = controller.projectToPlane(new Vector2(0, -0.2), 0.82);
      expect(hit).not.toBeNull();
      expect(hit!.y).toBeCloseTo(0.82, 9);
    });

    it('точка на поднятой плоскости ближе к камере, чем на полу', () => {
      // Луч, нацеленный на крышку тумбы, пересекает пол далеко за ней:
      // именно поэтому позицию нельзя считать по полу
      const ndc = new Vector2(0, -0.4);
      const floor = controller.projectToFloor(ndc)!;
      const raised = controller.projectToPlane(ndc, 0.82)!;

      const distanceToFloor = floor.distanceTo(camera.position);
      const distanceToRaised = raised.distanceTo(camera.position);
      expect(distanceToRaised).toBeLessThan(distanceToFloor);
    });

    it('повторные вызовы с разной высотой не портят друг друга', () => {
      const ndc = new Vector2(0.1, -0.25);
      const first = controller.projectToPlane(ndc, 0)!;
      controller.projectToPlane(ndc, 1.45);
      const again = controller.projectToPlane(ndc, 0)!;

      expect(again.x).toBeCloseTo(first.x, 9);
      expect(again.z).toBeCloseTo(first.z, 9);
    });
  });
});
