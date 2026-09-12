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
import { boxCorners, swingArc, type Box, type SwingZone } from '@furni/shared';

/**
 * Зоны открывания дверей и выдвижения ящиков на полу.
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

  /**
   * Полная пересборка: дверей единицы, инкрементальность не окупается.
   *
   * Зоны ящиков передаются отдельно и только для выделенного объекта:
   * ряд кухни из пяти тумб залил бы прямоугольниками весь пол.
   */
  build(zones: readonly SwingZone[], pullouts: readonly Box[] = []): void {
    this.clear();

    for (const box of pullouts) {
      const corners = boxCorners(box);
      this.addOutline([...corners, corners[0]!]);
      this.addFill(corners[0]!, [corners[1]!, corners[2]!, corners[3]!]);
    }

    for (const zone of zones) {
      const arc = swingArc(zone);
      // Контур сектора: от петли по закрытому радиусу, по дуге и обратно
      this.addOutline([zone.hinge, ...arc, zone.hinge]);
      this.addFill(zone.hinge, arc);
    }
  }

  private addOutline(points: readonly { x: number; y: number }[]): void {
    const line = new Line(lineGeometry(points), this.lineMaterial);
    line.frustumCulled = false;
    this.lines.push(line);
    this.root.add(line);
  }

  private addFill(
    apex: { x: number; y: number },
    rim: readonly { x: number; y: number }[],
  ): void {
    const fill = new Mesh(fanGeometry(apex, rim), this.fillMaterial);
    fill.frustumCulled = false;
    this.fills.push(fill);
    this.root.add(fill);
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
