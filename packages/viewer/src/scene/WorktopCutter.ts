import { BoxGeometry, Mesh, Object3D } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { subtractRects, type Rect } from '@furni/shared';

/**
 * Вырез в столешнице под врезное изделие.
 *
 * Пайплайн выреза сделать не может: он не знает, где встанет мойка.
 * Поэтому плита приезжает целой отдельным узлом `slab:*`, а окно в ней
 * прорезается здесь — по тому, что реально врезано в сцене.
 *
 * Без выреза мойка выглядит закрытой тарелкой: сверху видно камень,
 * а не чашу, и понять, что это мойка, невозможно.
 *
 * Режется только плита. Кромка и пристенный плинтус остаются нетронутыми:
 * они приехали из модели со своим профилем, и перестраивать их значило бы
 * повторять во вьюере то, что уже собрано пайплайном.
 */

const MM = 1000;

/** Узел плиты и её размеры из модели. */
interface Slab {
  node: Mesh;
  widthMm: number;
  depthMm: number;
  thicknessMm: number;
  offsetZMm: number;
}

/** Окно в плите: прямоугольник в системе координат столешницы. */
export type CutoutRect = Rect;

function numberOf(node: Object3D, key: string): number {
  const value = node.userData?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Узел плиты в модели столешницы.
 *
 * Имя сверяется и с userData: загрузчик glTF чистит имена от двоеточий,
 * и `slab:0` приезжает в сцену как `slab0`.
 */
export function slabOf(root: Object3D): Slab | null {
  let found: Slab | null = null;

  root.traverse((node) => {
    if (found || !(node instanceof Mesh)) return;
    const original = node.userData?.['name'];
    const name = typeof original === 'string' ? original : node.name;
    if (!name.startsWith('slab')) return;

    const widthMm = numberOf(node, 'slabWidthMm');
    if (widthMm <= 0) return;

    found = {
      node,
      widthMm,
      depthMm: numberOf(node, 'slabDepthMm'),
      thicknessMm: numberOf(node, 'slabThicknessMm'),
      offsetZMm: numberOf(node, 'slabOffsetZMm'),
    };
  });

  return found;
}

export class WorktopCutter {
  /** Исходная геометрия плиты: по ней возвращают целый вид. */
  private readonly original = new WeakMap<Mesh, BoxGeometry>();
  /** Что вырезано сейчас: лишняя пересборка стоит кадра на каждый жест */
  private readonly applied = new WeakMap<Mesh, string>();

  /**
   * Прорезать в столешнице окна.
   *
   * Пустой список возвращает плиту к целому виду: мойку могли утащить
   * на другую тумбу, и дыра не должна оставаться в камне.
   */
  cut(root: Object3D, holes: readonly CutoutRect[]): boolean {
    const slab = slabOf(root);
    if (!slab) return false;

    const key = holes
      .map((h) => `${Math.round(h.x)}:${Math.round(h.y)}:${h.widthMm}:${h.depthMm}`)
      .sort()
      .join('|');
    if (this.applied.get(slab.node) === key) return false;
    this.applied.set(slab.node, key);

    const stretch = slab.node.parent?.scale.x ?? 1;
    // Габарит плиты берётся из модели, а масштаб растянутой столешницы
    // живёт на родителе: окно задано в мировых мм и должно поехать вместе
    const plan: Rect = {
      x: 0,
      y: slab.offsetZMm,
      widthMm: slab.widthMm,
      depthMm: slab.depthMm,
    };

    const local = holes.map((hole) => ({
      ...hole,
      x: hole.x / stretch,
      widthMm: hole.widthMm / stretch,
    }));

    const pieces = subtractRects(plan, local);
    if (pieces.length <= 1) {
      this.restore(slab.node);
      return true;
    }

    const parts = pieces.map((piece) => {
      const box = new BoxGeometry(
        piece.widthMm / MM,
        slab.thicknessMm / MM,
        piece.depthMm / MM,
      );
      box.translate(piece.x / MM, slab.thicknessMm / MM / 2, piece.y / MM);
      return box;
    });

    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!merged) return false;

    this.keepOriginal(slab.node);
    slab.node.geometry = merged;
    return true;
  }

  /** Вернуть плите целый вид. */
  private restore(node: Mesh): void {
    const original = this.original.get(node);
    if (!original) return;
    if (node.geometry !== original) node.geometry.dispose();
    node.geometry = original;
  }

  private keepOriginal(node: Mesh): void {
    if (this.original.has(node)) {
      // Прошлый вырез больше не нужен: исходник хранится отдельно
      if (node.geometry !== this.original.get(node)) node.geometry.dispose();
      return;
    }
    this.original.set(node, node.geometry as BoxGeometry);
  }
}
