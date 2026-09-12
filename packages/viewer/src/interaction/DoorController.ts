import { Group, Object3D } from 'three';

/**
 * Распашные дверцы мебели.
 *
 * Пайплайн уводит каждую дверцу в GLB отдельным узлом и записывает в
 * него точку навески: посчитать её во вьюере по габариту нельзя —
 * дверца повернулась бы вокруг своего центра и уехала сквозь боковину.
 *
 * Поворот делается не самим узлом, а обёрткой в точке навески: узел
 * приезжает с уже запечённой трансформацией, и менять её значит спорить
 * с тем, что сделал оптимизатор.
 *
 * Состояние живёт только здесь и в документ сцены не попадает: открытая
 * дверца это осмотр, а не свойство заказа — та же причина, что у ящиков.
 */

/** Длительность хода. Дольше — вязко, короче — рывком. */
const DURATION_S = 0.32;

interface DoorAnimation {
  pivot: Group;
  from: number;
  to: number;
  elapsedS: number;
}

/** Угол распахивания в градусах; 0 — узел не дверца. */
export function doorAngleOf(node: Object3D): number {
  const angle = node.userData?.['maxAngleDeg'];
  return typeof angle === 'number' && Number.isFinite(angle) ? angle : 0;
}

/**
 * Узлы дверец модели.
 *
 * Имя сверяется и с userData: загрузчик glTF чистит имена от двоеточий,
 * и `door:0` приезжает в сцену как `door0`.
 */
export function doorsOf(root: Object3D): Object3D[] {
  const found: Object3D[] = [];
  root.traverse((node) => {
    if (isDoor(node)) found.push(node);
  });
  return found;
}

function isDoor(node: Object3D): boolean {
  if (doorAngleOf(node) === 0) return false;
  const original = node.userData?.['name'];
  const name = typeof original === 'string' ? original : node.name;
  return name.startsWith('door');
}

export class DoorController {
  private readonly animations = new Map<Group, DoorAnimation>();
  /** Обёртка в точке навески на каждую дверцу. */
  private readonly pivots = new WeakMap<Object3D, Group>();

  /**
   * Обёртка, вокруг которой вращается дверца.
   *
   * Создаётся при первом обращении: пересобирать сцену ради неё нельзя —
   * модель приходит из общего кэша загрузчика.
   */
  private pivotFor(node: Object3D): Group | null {
    const existing = this.pivots.get(node);
    if (existing) return existing;

    const parent = node.parent;
    if (!parent) return null;

    const hingeX = numberOf(node, 'hingeXMm') / 1000;
    const hingeZ = numberOf(node, 'hingeZMm') / 1000;

    const pivot = new Group();
    pivot.name = `hinge:${node.name}`;
    pivot.position.set(hingeX, 0, hingeZ);
    parent.add(pivot);

    // Геометрия узла остаётся на месте: сдвигаем его ровно на столько,
    // на сколько подняли обёртку
    node.position.x -= hingeX;
    node.position.z -= hingeZ;
    pivot.add(node);

    this.pivots.set(node, pivot);
    return pivot;
  }

  isOpen(node: Object3D): boolean {
    const pivot = this.pivots.get(node);
    if (!pivot) return false;

    const animation = this.animations.get(pivot);
    return Math.abs(animation ? animation.to : pivot.rotation.y) > 1e-4;
  }

  /** Переключает дверцу и возвращает новое состояние. */
  toggle(node: Object3D): boolean {
    const angle = doorAngleOf(node);
    if (angle === 0) return false;

    const pivot = this.pivotFor(node);
    if (!pivot) return false;

    const open = !this.isOpen(node);
    this.animations.set(pivot, {
      pivot,
      from: pivot.rotation.y,
      to: open ? (angle * Math.PI) / 180 : 0,
      elapsedS: 0,
    });
    return open;
  }

  /** Открыть или закрыть все дверцы модели разом. */
  setAll(root: Object3D, open: boolean): void {
    for (const node of doorsOf(root)) {
      if (this.isOpen(node) !== open) this.toggle(node);
    }
  }

  /**
   * Шаг анимации. true означает, что что-то двигалось: по нему вьюер
   * решает, нужен ли новый кадр.
   */
  update(dtS: number): boolean {
    if (this.animations.size === 0) return false;

    for (const animation of [...this.animations.values()]) {
      animation.elapsedS += dtS;
      const t = Math.min(1, animation.elapsedS / DURATION_S);
      // Замедление к концу: дверца на доводчике не бьётся о корпус
      const eased = 1 - (1 - t) ** 3;
      animation.pivot.rotation.y = animation.from + (animation.to - animation.from) * eased;
      if (t >= 1) this.animations.delete(animation.pivot);
    }
    return true;
  }

  get busy(): boolean {
    return this.animations.size > 0;
  }

  dispose(): void {
    this.animations.clear();
  }
}

function numberOf(node: Object3D, key: string): number {
  const value = node.userData?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
