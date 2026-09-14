import { describe, expect, it } from 'vitest';
import { placementBox } from './box';
import type { Box } from './box';
import { restingHeightMm, restsOnSomething, settlePlacements, supportTopMm } from './support';

/** Нижний кухонный модуль 600×820×600, стоящий на полу. */
const cabinet = (over: Partial<Box> = {}): Box => ({
  centre: { x: 0, y: 0 },
  halfWidthMm: 300,
  halfDepthMm: 300,
  rotationDeg: 0,
  bottomMm: 0,
  topMm: 820,
  ...over,
});

describe('высота опоры', () => {
  const worktop = cabinet({ bottomMm: 820, topMm: 858 });

  it('без опоры под точкой это пол', () => {
    expect(supportTopMm({ x: 5000, y: 0 }, [cabinet()])).toBe(0);
  });

  it('берёт верх опоры под точкой', () => {
    expect(supportTopMm({ x: 0, y: 0 }, [cabinet()])).toBe(820);
  });

  it('берёт максимум: вещь встаёт на столешницу, а не под неё', () => {
    expect(supportTopMm({ x: 0, y: 0 }, [cabinet(), worktop])).toBe(858);
  });

  it('высота установки не опускается ниже собственной отметки', () => {
    // Навесной шкаф остаётся на 1450 над тумбой высотой 820
    expect(restingHeightMm(1450, 820)).toBe(1450);
  });

  it('вещь с нулевой отметкой поднимается на опору', () => {
    expect(restingHeightMm(0, 858)).toBe(858);
  });

  it('без опоры вещь остаётся на своей отметке', () => {
    expect(restingHeightMm(0, 0)).toBe(0);
    expect(restingHeightMm(1450, 0)).toBe(1450);
  });
});

describe('осадка сцены', () => {
  const item = (
    instanceId: string,
    over: {
      x?: number;
      y?: number;
      z?: number;
      heightMm?: number;
      mountHeightMm?: number;
      stackable?: boolean;
    } = {},
  ) => ({
    instanceId,
    placement: {
      position: { x: over.x ?? 0, y: over.y ?? 0, z: over.z ?? 0 },
      rotationY: 0,
    },
    size: { widthMm: 600, heightMm: over.heightMm ?? 820, depthMm: 600 },
    mountHeightMm: over.mountHeightMm ?? 0,
    stackable: over.stackable ?? false,
  });

  it('согласованная сцена не меняется', () => {
    const changes = settlePlacements([
      item('cabinet'),
      item('box', { y: 820, heightMm: 176, mountHeightMm: 100, stackable: true }),
    ]);
    expect(changes).toEqual([]);
  });

  it('вещь опускается, когда опору убрали', () => {
    // Тумбы больше нет, ящик остался висеть на её высоте
    const changes = settlePlacements([
      item('box', { y: 820, heightMm: 176, mountHeightMm: 100, stackable: true }),
    ]);
    expect(changes).toEqual([{ instanceId: 'box', yMm: 100 }]);
  });

  it('осадка не поднимает объект сама', () => {
    // Подъём это действие пользователя: он целится в поверхность.
    // Осадка, забрасывающая вещь на подвернувшийся объект выше,
    // перечёркивала бы точную постановку
    const changes = settlePlacements([
      item('cabinet'),
      item('box', { y: 100, heightMm: 176, mountHeightMm: 100, stackable: true }),
    ]);
    expect(changes).toEqual([]);
  });

  it('цепочка опор оседает целиком', () => {
    // Тумба -> столешница -> ящик: убрали тумбу, оседают обе вещи над ней
    const changes = settlePlacements([
      item('worktop', { y: 820, heightMm: 38, mountHeightMm: 820 }),
      item('box', { y: 858, heightMm: 176, mountHeightMm: 100, stackable: true }),
    ]);
    // Столешница держит свою отметку, ящик остаётся на ней
    expect(changes).toEqual([]);
  });

  it('вещь садится на нижнюю опору, когда убрали верхнюю', () => {
    const changes = settlePlacements([
      item('cabinet'),
      item('box', { y: 858, heightMm: 176, mountHeightMm: 100, stackable: true }),
    ]);
    expect(changes).toEqual([{ instanceId: 'box', yMm: 820 }]);
  });

  it('объект не на опоре высоты не меняет', () => {
    const changes = settlePlacements([
      item('cabinet'),
      item('far', { x: 5000, y: 0 }),
    ]);
    expect(changes).toEqual([]);
  });

  it('навесной шкаф над тумбой остаётся на своей отметке', () => {
    const changes = settlePlacements([
      item('cabinet'),
      item('upper', { y: 1450, heightMm: 720, mountHeightMm: 1450 }),
    ]);
    expect(changes).toEqual([]);
  });

  it('корпусная мебель на опору не забирается', () => {
    // Нижний шкаф под навесным обязан остаться на полу
    const changes = settlePlacements([
      item('upper', { y: 1450, heightMm: 720, mountHeightMm: 1450 }),
      item('base', { y: 0 }),
    ]);
    expect(changes).toEqual([]);
  });

  it('две вещи на одном уровне осадка не складывает стопкой', () => {
    // Это конфликт, и он должен остаться видимым конфликтом,
    // а не превратиться молча в стопку
    const changes = settlePlacements([
      item('a', { y: 0, heightMm: 200, stackable: true }),
      item('b', { y: 0, heightMm: 200, stackable: true }),
    ]);
    expect(changes).toEqual([]);
  });

  it('стопка устойчива: повторная осадка её не разбирает', () => {
    const stacked = [
      item('a', { y: 0, heightMm: 200, stackable: true }),
      item('b', { y: 200, heightMm: 200, stackable: true }),
    ];
    expect(settlePlacements(stacked)).toEqual([]);
  });

  it('результат устойчив: повторная осадка ничего не меняет', () => {
    const items = [
      item('cabinet'),
      item('box', { y: 858, heightMm: 176, mountHeightMm: 100, stackable: true }),
    ];
    const first = settlePlacements(items);
    expect(first).toHaveLength(1);

    const applied = items.map((entry) => {
      const change = first.find((c) => c.instanceId === entry.instanceId);
      return change
        ? { ...entry, placement: { ...entry.placement, position: { ...entry.placement.position, y: change.yMm } } }
        : entry;
    });
    expect(settlePlacements(applied)).toEqual([]);
  });

  it('пустая сцена не даёт изменений', () => {
    expect(settlePlacements([])).toEqual([]);
  });
});

describe('ограничение поиска опоры сверху', () => {
  const shelf = cabinet({ bottomMm: 0, topMm: 820 });
  const upper = cabinet({ bottomMm: 1450, topMm: 2170 });

  it('без ограничения берётся самая высокая опора', () => {
    expect(supportTopMm({ x: 0, y: 0 }, [shelf, upper])).toBe(2170);
  });

  it('ограничение отсекает то, что выше объекта', () => {
    expect(supportTopMm({ x: 0, y: 0 }, [shelf, upper], 900)).toBe(820);
  });

  it('ограничение ниже всех опор оставляет пол', () => {
    expect(supportTopMm({ x: 0, y: 0 }, [shelf, upper], 100)).toBe(0);
  });
});

describe('осадка и опоры выше своей поверхности', () => {
  /** Столешница с пристенным плинтусом: верх габарита выше рабочей плоскости. */
  const worktop = (over: Partial<Box> = {}): Box => ({
    centre: { x: 0, y: 0 },
    halfWidthMm: 600,
    halfDepthMm: 300,
    rotationDeg: 0,
    bottomMm: 820,
    topMm: 918,
    ...over,
  });

  const sinkItem = (y: number) => ({
    instanceId: 'sink',
    placement: { position: { x: 0, y, z: 0 }, rotationY: 0 },
    size: { widthMm: 500, heightMm: 180, depthMm: 440 },
    mountHeightMm: 0,
    stackable: true,
  });

  const worktopItem = {
    instanceId: 'worktop',
    placement: { position: { x: 0, y: 820, z: 0 }, rotationY: 0 },
    size: { widthMm: 1200, heightMm: 98, depthMm: 600 },
    mountHeightMm: 820,
    stackable: false,
  };

  it('вещь на рабочей плоскости не роняется из-за плинтуса выше неё', () => {
    // Верх габарита столешницы 918, мойка стоит на 858: сравнение
    // с верхом габарита сочло бы столешницу «висящей выше»
    expect(settlePlacements([worktopItem, sinkItem(858)])).toEqual([]);
  });

  it('вещь опускается, когда столешницу убрали', () => {
    expect(settlePlacements([sinkItem(858)])).toEqual([{ instanceId: 'sink', yMm: 0 }]);
  });

  it('опорой считается вхождение в вертикальный диапазон', () => {
    expect(restsOnSomething({ x: 0, y: 0 }, 858, [worktop()])).toBe(true);
    expect(restsOnSomething({ x: 0, y: 0 }, 820, [worktop()])).toBe(true);
    expect(restsOnSomething({ x: 0, y: 0 }, 918, [worktop()])).toBe(true);
  });

  it('вне диапазона опоры нет', () => {
    expect(restsOnSomething({ x: 0, y: 0 }, 1200, [worktop()])).toBe(false);
    expect(restsOnSomething({ x: 0, y: 0 }, 400, [worktop()])).toBe(false);
  });

  it('опора в стороне не считается', () => {
    expect(restsOnSomething({ x: 5000, y: 0 }, 858, [worktop()])).toBe(false);
  });
});

describe('врезка в опору', () => {
  it('утопленное изделие садится ниже опоры на глубину врезки', () => {
    // Мойка с чашей 185 мм на столешнице 858: бортик ложится заподлицо
    expect(restingHeightMm(0, 858, 185)).toBe(673);
  });

  it('без врезки поведение прежнее', () => {
    expect(restingHeightMm(0, 858)).toBe(858);
  });

  it('собственная отметка изделия сильнее врезки', () => {
    // Навесной шкаф висит на своей высоте, а не проваливается под опору
    expect(restingHeightMm(1450, 858, 185)).toBe(1450);
  });
});

describe('габарит утопленного изделия', () => {
  it('чаша внутри тумбы в габарит коллизий не входит', () => {
    const box = placementBox(
      { position: { x: 0, y: 673, z: 0 }, rotationY: 0 },
      { widthMm: 500, heightMm: 194, depthMm: 440, recessMm: 185 },
    );

    // Низ габарита — бортик на уровне столешницы, а не дно чаши
    expect(box.bottomMm).toBe(858);
    expect(box.topMm).toBe(867);
  });
});
