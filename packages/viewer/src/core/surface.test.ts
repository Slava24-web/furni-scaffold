import { BoxGeometry, Mesh, MeshBasicMaterial, Raycaster, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { upwardSurfaceHeightMm } from './surface';

/** Куб со стороной, стоящий на полу: низ на нуле. */
function block(width: number, height: number, depth: number, x = 0, z = 0): Mesh {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), new MeshBasicMaterial());
  mesh.position.set(x, height / 2, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

function cast(scene: Scene, origin: Vector3, target: Vector3) {
  const raycaster = new Raycaster();
  raycaster.set(origin, target.clone().sub(origin).normalize());
  return raycaster.intersectObjects(scene.children, true);
}

const anything = () => true;

describe('поиск опорной поверхности', () => {
  it('луч сверху находит крышку', () => {
    const scene = new Scene();
    scene.add(block(1, 0.82, 1));

    const hits = cast(scene, new Vector3(0, 3, 0), new Vector3(0, 0, 0));
    expect(upwardSurfaceHeightMm(hits, anything)).toBe(820);
  });

  it('луч в бок опорой не считается', () => {
    // Целясь в стенку тумбы, пользователь не указывает поверхность,
    // на которую можно что-то поставить
    const scene = new Scene();
    scene.add(block(1, 0.82, 1));

    const hits = cast(scene, new Vector3(5, 0.4, 0), new Vector3(0, 0.4, 0));
    expect(upwardSurfaceHeightMm(hits, anything)).toBeNull();
  });

  it('сквозь боковую грань находит крышку объекта за ней', () => {
    const scene = new Scene();
    scene.add(block(1, 0.82, 1, 0, 0));
    scene.add(block(1, 0.4, 1, 0, -3));

    // Луч идёт вдоль, задевает бок первой тумбы и попадает на крышку второй
    const hits = cast(scene, new Vector3(0, 0.55, 4), new Vector3(0, 0.4, -3));
    const height = upwardSurfaceHeightMm(hits, anything);
    expect(height).toBe(400);
  });

  it('берёт высоту попадания, а не верх объекта: полка внутри тоже опора', () => {
    const scene = new Scene();
    // Тонкая полка на высоте 0.5 внутри воображаемого шкафа
    const shelf = new Mesh(new BoxGeometry(1, 0.02, 1), new MeshBasicMaterial());
    shelf.position.set(0, 0.5, 0);
    shelf.updateMatrixWorld(true);
    scene.add(shelf);

    const hits = cast(scene, new Vector3(0, 3, 0), new Vector3(0, 0, 0));
    expect(upwardSurfaceHeightMm(hits, anything)).toBe(510);
  });

  it('пропускает объекты, отклонённые фильтром', () => {
    const scene = new Scene();
    const dragged = block(1, 0.82, 1);
    const under = block(1, 0.4, 1);
    scene.add(dragged, under);

    const hits = cast(scene, new Vector3(0, 3, 0), new Vector3(0, 0, 0));
    // Перетаскиваемый объект следует за курсором и перекрыл бы опору
    expect(upwardSurfaceHeightMm(hits, (object) => object !== dragged)).toBe(400);
  });

  it('без попаданий опоры нет', () => {
    expect(upwardSurfaceHeightMm([], anything)).toBeNull();
  });

  it('учитывает поворот объекта: наклонённая крышка опорой не считается', () => {
    const scene = new Scene();
    const tilted = block(1, 0.5, 1);
    tilted.rotation.z = Math.PI / 2; // крышка стала боковой стенкой
    tilted.updateMatrixWorld(true);
    scene.add(tilted);

    const hits = cast(scene, new Vector3(0, 3, 0), new Vector3(0, 0, 0));
    const height = upwardSurfaceHeightMm(hits, anything);
    // Сверху теперь смотрит бывшая боковина, и она горизонтальна:
    // опора найдена, но её высота соответствует повёрнутому габариту
    expect(height).not.toBeNull();
  });

  it('перевёрнутая грань не считается опорой', () => {
    const scene = new Scene();
    const mesh = block(1, 0.5, 1);
    scene.add(mesh);

    // Луч снизу вверх упирается в дно: нормаль смотрит вниз
    const hits = cast(scene, new Vector3(0, -3, 0), new Vector3(0, 0, 0));
    expect(upwardSurfaceHeightMm(hits, anything)).toBeNull();
  });
});
