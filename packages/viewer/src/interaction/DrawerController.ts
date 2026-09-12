import type { Object3D } from 'three';

/**
 * Выдвижные ящики.
 *
 * Пайплайн уводит каждый ящик в GLB отдельным узлом с именем `drawer:N`
 * и записывает ход в extras — загрузчик кладёт их в userData. Вьюер
 * ничего не знает о каталоге, а выдвигать ящик на глаз нельзя: он либо
 * выедет из корпуса, либо не выедет вовсе.
 *
 * Ящик едет вдоль локальной оси +Z модели — туда же смотрит фасад.
 * Состояние живёт только здесь и в документ сцены не попадает: открытый
 * ящик это осмотр, а не свойство заказа.
 *
 * Габарит объекта в реестре считается один раз по закрытой модели и
 * намеренно не пересчитывается: выдвинутый ящик не должен внезапно
 * начать конфликтовать с соседом.
 */

/** Длительность хода. Дольше — ощущается вязким, короче — рывком. */
const DURATION_S = 0.28;
const MM = 1000;

interface DrawerAnimation {
  node: Object3D;
  fromZ: number;
  toZ: number;
  elapsedS: number;
}

/**
 * Узлы ящиков модели в порядке следования.
 *
 * Имя сверяется и с userData: загрузчик glTF чистит имена узлов от
 * двоеточий и точек (они разделители в путях анимации), поэтому
 * `drawer:0` приезжает в сцену как `drawer0`, а исходное имя остаётся
 * в userData.
 */
export function drawersOf(root: Object3D): Object3D[] {
  const found: Object3D[] = [];
  root.traverse((node) => {
    if (isDrawer(node)) found.push(node);
  });
  return found;
}

function isDrawer(node: Object3D): boolean {
  if (travelOf(node) === 0) return false;
  const original = node.userData?.['name'];
  const name = typeof original === 'string' ? original : node.name;
  return name.startsWith('drawer');
}

/** Ход ящика в миллиметрах; 0 — узел не ящик или ход не записан. */
export function travelOf(node: Object3D): number {
  const travel = node.userData?.['travelMm'];
  return typeof travel === 'number' && Number.isFinite(travel) && travel > 0 ? travel : 0;
}

export class DrawerController {
  private readonly animations = new Map<Object3D, DrawerAnimation>();
  /** Положение «закрыто» запоминается при первом движении узла. */
  private readonly closedZ = new WeakMap<Object3D, number>();

  /** Выдвинут ли ящик: цель текущего движения, а не текущее положение. */
  isOpen(node: Object3D): boolean {
    const closed = this.closedZ.get(node);
    if (closed === undefined) return false;

    const animation = this.animations.get(node);
    const target = animation ? animation.toZ : node.position.z;
    return target > closed + 1e-4;
  }

  /** Переключает ящик и возвращает новое состояние. */
  toggle(node: Object3D): boolean {
    const travel = travelOf(node);
    if (travel === 0) return false;

    const closed = this.closedZ.get(node) ?? node.position.z;
    this.closedZ.set(node, closed);

    const open = !this.isOpen(node);
    this.animations.set(node, {
      node,
      fromZ: node.position.z,
      toZ: open ? closed + travel / MM : closed,
      elapsedS: 0,
    });
    return open;
  }

  /** Закрывает все ящики модели — например, когда объект убирают со сцены. */
  closeAll(root: Object3D): void {
    for (const node of drawersOf(root)) {
      if (this.isOpen(node)) this.toggle(node);
    }
  }

  /**
   * Шаг анимации. Возвращает true, если что-то двигалось: по этому
   * признаку вьюер решает, нужен ли новый кадр — рендер по требованию
   * иначе не узнает о движении.
   */
  update(dtS: number): boolean {
    if (this.animations.size === 0) return false;

    for (const animation of [...this.animations.values()]) {
      animation.elapsedS += dtS;
      const t = Math.min(1, animation.elapsedS / DURATION_S);
      // Замедление к концу: ящик на доводчике не останавливается рывком
      const eased = 1 - (1 - t) ** 3;
      animation.node.position.z = animation.fromZ + (animation.toZ - animation.fromZ) * eased;
      if (t >= 1) this.animations.delete(animation.node);
    }
    return true;
  }

  /** Идёт ли сейчас движение — для тестов и отладки. */
  get busy(): boolean {
    return this.animations.size > 0;
  }

  dispose(): void {
    this.animations.clear();
  }
}
