import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  type Scene,
} from 'three';
import { swingArc, type SwingZone } from '@furni/shared';

/**
 * Зоны открывания дверей на полу.
 *
 * Рисуются как на плане: два радиуса и дуга между ними, залитые
 * полупрозрачным сектором. Без этой подсказки пользователь ставит тумбу
 * туда, где дверь её не пропустит, и узнаёт об этом только по сообщению
 * о конфликте — а причину не видит.
 *
 * Геометрия сектора берётся из той же функции, по которой считается
 * конфликт: подсвеченная зона и проверяемая зона совпадают по
 * определению, а не по совпадению.
 */

const MM = 1000;
/** Чуть выше пола: на самом полу заливка мерцает z-fighting. */
const HEIGHT_MM = 12;
const COLOR = 0x2f6fed;

export class SwingOverlay {
  readonly root = new Group();

  private readonly lineMaterial = new LineBasicMaterial({
    color: COLOR,
    transparent: true,
    opacity: 0.55,
  });

  private readonly fillMaterial = new MeshBasicMaterial({
    color: COLOR,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: DoubleSide,
  });

  private lines: Line[] = [];
  private fills: Mesh[] = [];

  constructor(private readonly scene: Scene) {
    this.root.name = 'swings';
    scene.add(this.root);
  }

  /** Полная пересборка: дверей единицы, инкрементальность не окупается. */
  build(zones: readonly SwingZone[]): void {
    this.clear();

    for (const zone of zones) {
      const arc = swingArc(zone);
      // Контур сектора: от петли по закрытому радиусу, по дуге и обратно
      const outline = [zone.hinge, ...arc, zone.hinge];

      const line = new Line(lineGeometry(outline), this.lineMaterial);
      line.frustumCulled = false;
      this.lines.push(line);
      this.root.add(line);

      const fill = new Mesh(fanGeometry(zone.hinge, arc), this.fillMaterial);
      fill.frustumCulled = false;
      this.fills.push(fill);
      this.root.add(fill);
    }
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  private clear(): void {
    for (const object of [...this.lines, ...this.fills]) {
      this.root.remove(object);
      object.geometry.dispose();
    }
    this.lines = [];
    this.fills = [];
  }

  dispose(): void {
    this.clear();
    this.lineMaterial.dispose();
    this.fillMaterial.dispose();
    this.scene.remove(this.root);
  }
}

function lineGeometry(points: readonly { x: number; y: number }[]): BufferGeometry {
  const positions: number[] = [];
  for (const point of points) positions.push(point.x / MM, HEIGHT_MM / MM, point.y / MM);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}

/**
 * Заливка сектора веером треугольников от петли.
 *
 * Обход задаётся направлением дуги, а сторону видимости берёт на себя
 * DoubleSide-материал: сектор смотрят сверху, но камера опускается и
 * ниже уровня пола.
 */
function fanGeometry(
  hinge: { x: number; y: number },
  arc: readonly { x: number; y: number }[],
): BufferGeometry {
  const positions: number[] = [];
  const y = HEIGHT_MM / MM;

  for (let i = 0; i + 1 < arc.length; i++) {
    positions.push(hinge.x / MM, y, hinge.y / MM);
    positions.push(arc[i]!.x / MM, y, arc[i]!.y / MM);
    positions.push(arc[i + 1]!.x / MM, y, arc[i + 1]!.y / MM);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
