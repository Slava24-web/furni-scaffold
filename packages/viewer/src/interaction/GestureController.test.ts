import { Vector2 } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GestureController, type GestureEvent } from './GestureController';

/**
 * Заглушка DOM-элемента: vitest в этом пакете работает без окружения
 * браузера, а контроллеру нужны только слушатели и захват указателя.
 */
function element(options: { captureThrows?: boolean } = {}) {
  const listeners = new Map<string, ((e: unknown) => void)[]>();
  const el = {
    style: {} as Record<string, string>,
    addEventListener(type: string, handler: (e: unknown) => void) {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener() {},
    setPointerCapture() {
      if (options.captureThrows) throw new Error('InvalidPointerId');
    },
    releasePointerCapture() {},
  };

  const fire = (type: string, event: Record<string, unknown>): void => {
    for (const handler of listeners.get(type) ?? []) {
      handler({ preventDefault() {}, ...event });
    }
  };

  return { el: el as unknown as HTMLElement, fire };
}

function setup(options: { captureThrows?: boolean; onSelection?: boolean } = {}) {
  const events: GestureEvent[] = [];
  const { el, fire } = element(options);

  const controller = new GestureController(el, {
    onGesture: (e) => events.push(e),
    isOnSelection: () => options.onSelection ?? false,
  });

  return { controller, events, fire };
}

const down = (id: number, x: number, y: number) => ['pointerdown', { pointerId: id, clientX: x, clientY: y }] as const;
const move = (id: number, x: number, y: number) => ['pointermove', { pointerId: id, clientX: x, clientY: y }] as const;

describe('GestureController', () => {
  it('одиночное касание с движением даёт перетаскивание', () => {
    const { events, fire } = setup();

    fire(...down(1, 100, 100));
    fire(...move(1, 160, 140));

    expect(events.map((e) => e.type)).toContain('dragStart');
    expect(events.map((e) => e.type)).toContain('dragMove');
  });

  it('микросдвиг перетаскиванием не считается', () => {
    const { events, fire } = setup();

    fire(...down(1, 100, 100));
    fire(...move(1, 103, 101));

    expect(events.map((e) => e.type)).not.toContain('dragStart');
  });

  it('сведение двух пальцев даёт пинч', () => {
    const { events, fire } = setup();

    fire(...down(1, 100, 100));
    fire(...down(2, 300, 100));
    fire(...move(2, 200, 100));

    const pinch = events.find((e) => e.type === 'pinch');
    expect(pinch).toBeDefined();
    expect(pinch?.type === 'pinch' && pinch.scale).toBeLessThan(1);
  });

  it('поворот двумя пальцами даёт twoFingerRotate', () => {
    const { events, fire } = setup();

    fire(...down(1, 100, 100));
    fire(...down(2, 300, 100));
    // Второй палец уходит вниз: пара разворачивается по часовой стрелке
    fire(...move(2, 300, 200));

    const rotate = events.find((e) => e.type === 'twoFingerRotate');
    expect(rotate).toBeDefined();
    expect(rotate?.type === 'twoFingerRotate' && rotate.angle).toBeGreaterThan(0);
  });

  it('обратный поворот даёт угол другого знака', () => {
    const { events, fire } = setup();

    fire(...down(1, 100, 100));
    fire(...down(2, 300, 100));
    fire(...move(2, 300, -100));

    const rotate = events.find((e) => e.type === 'twoFingerRotate');
    expect(rotate?.type === 'twoFingerRotate' && rotate.angle).toBeLessThan(0);
  });

  it('второй палец отменяет начатое перетаскивание объекта', () => {
    const { events, fire } = setup({ onSelection: true });

    fire(...down(1, 100, 100));
    fire(...move(1, 200, 200));
    fire(...down(2, 400, 400));

    expect(events.map((e) => e.type)).toContain('dragEnd');
  });

  it('сбой захвата указателя не роняет жест', () => {
    // Браузер бросает исключение, если указатель уже неактивен
    const { events, fire } = setup({ captureThrows: true });

    expect(() => fire(...down(1, 100, 100))).not.toThrow();
    fire(...move(1, 200, 160));

    expect(events.map((e) => e.type)).toContain('dragStart');
  });

  it('отключает браузерные жесты на элементе', () => {
    const { el } = element();
    new GestureController(el, { onGesture: () => {}, isOnSelection: () => false });

    expect(el.style.touchAction).toBe('none');
  });

  it('движение неизвестного указателя игнорируется', () => {
    const { events, fire } = setup();

    fire(...move(9, 500, 500));

    expect(events).toHaveLength(0);
  });

  it('перетаскивание по выделению помечается флагом', () => {
    const { events, fire } = setup({ onSelection: true });

    fire(...down(1, 100, 100));
    fire(...move(1, 200, 200));

    const dragStart = events.find((e) => e.type === 'dragStart');
    expect(dragStart?.type === 'dragStart' && dragStart.onSelection).toBe(true);
  });
});
