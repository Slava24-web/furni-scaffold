import { Matrix3, Vector3, type Intersection, type Object3D } from 'three';

/**
 * Поиск поверхности, на которую можно поставить объект.
 *
 * Годится только грань, смотрящая вверх. Без этой проверки прицел в бок
 * или фасад тумбы означал бы постановку на её крышку: луч задел объект,
 * значит объект и есть опора. Пользователь при этом целился в вертикальную
 * стенку, на которую поставить ничего нельзя.
 *
 * Берётся высота самого попадания, а не верх задетого объекта: так вещь
 * встаёт и на полку внутри шкафа, и на столешницу, а не только на крышку.
 */

/**
 * Косинус предельного наклона опоры. Наклонная поверхность круче 60°
 * опорой не считается: предмет по ней съедет.
 */
const MIN_UPWARD_DOT = 0.5;

const UP = new Vector3(0, 1, 0);
const normalMatrix = new Matrix3();
const worldNormal = new Vector3();

/**
 * Высота первой подходящей поверхности вдоль луча, миллиметры.
 * null — подходящей поверхности нет, объект остаётся на своей отметке.
 *
 * @param intersections попадания луча, упорядоченные по удалению
 * @param accepts фильтр объектов: исключает перетаскиваемый и служебные
 */
export function upwardSurfaceHeightMm(
  intersections: readonly Intersection[],
  accepts: (object: Object3D) => boolean,
): number | null {
  for (const hit of intersections) {
    if (!hit.face || !accepts(hit.object)) continue;

    normalMatrix.getNormalMatrix(hit.object.matrixWorld);
    worldNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();

    if (worldNormal.dot(UP) < MIN_UPWARD_DOT) continue;
    // Округление до миллиметра: документ сцены хранит целые (CLAUDE.md)
    return Math.round(hit.point.y * 1000);
  }
  return null;
}
