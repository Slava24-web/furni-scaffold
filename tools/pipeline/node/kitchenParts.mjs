/**
 * Как устроены кухонные детали демо-тенанта `test`.
 *
 * Здесь только геометрия: корпуса, фасады, ящики, столешницы, мойка,
 * варочная панель. Какие изделия из них собраны и почём — в kitchen.mjs.
 *
 * Размеры взяты из ходового стандарта корпусной кухни:
 *   цоколь 100, корпус нижнего 720, столешница 38 -> рабочая 858
 *   глубина нижнего 560, верхнего 320
 *   низ верхнего ряда 1450 от пола
 * Всё в миллиметрах целыми (CLAUDE.md).
 */
import {
  cylinder,
  mergeGeometries,
  ring,
  roundedBox,
  segmentedBox,
  translate,
  tubeX,
  tubeZ,
} from './geometry.mjs';
import { carcassPanels, openBoxPanels } from './carcass.mjs';
import { flatFacade, panelFacade, swingOutDeg } from './facade.mjs';

export const PLINTH = 100;
export const BASE_CARCASS = 720;
export const WORKTOP_THICKNESS = 38;
export const BASE_DEPTH = 560;
export const WALL_DEPTH = 320;
export const WALL_MOUNT_HEIGHT = 1450;
export const WORKTOP_HEIGHT = PLINTH + BASE_CARCASS;
export const FACADE_THICKNESS = 18;
export const FACADE_GAP = 4;

/**
 * Ручка-скоба: две стойки и рейлинг между ними.
 * Строится в плоскости фасада, вынесена вперёд по Z.
 */
export function bracketHandle(centreXMm, centreYMm, frontZMm, spanMm = 224) {
  const postHeight = 32;
  const parts = [];

  // Стойки — точёные, а не брусковые: за ручку берутся рукой, и грань
  // на ней видна с любого ракурса
  for (const side of [-1, 1]) {
    parts.push(
      translate(
        tubeZ(7, postHeight, 8),
        centreXMm + (side * spanMm) / 2,
        centreYMm,
        frontZMm + postHeight / 2,
      ),
    );
  }

  // Рейлинг: настоящая труба вдоль X с заглушками по торцам
  parts.push(translate(tubeX(8, spanMm + 16, 12), centreXMm, centreYMm, frontZMm + postHeight));
  return parts;
}

/**
 * Фасад с зазором по периметру. Возвращает список деталей: у филёнчатого
 * фасада их пять, у плоского фронта ящика одна.
 */
export function facade(widthMm, heightMm, centreYMm, frontZMm) {
  return panelFacade(widthMm - FACADE_GAP * 2, heightMm, FACADE_THICKNESS, {
    x: 0,
    y: centreYMm,
    z: frontZMm,
  });
}

/**
 * Корпус шкафа из панелей: боковины, дно, крышка, задняя стенка и полки.
 * Сплошной брусок читался снаружи как монолит и не имел толщины стенок.
 */
export function carcass(widthMm, heightMm, depthMm, bottomMm, shelves = 1) {
  return carcassPanels(widthMm, heightMm, depthMm, { bottomMm, shelves });
}

/**
 * Цоколь: планка, утопленная под фасад.
 *
 * Раньше это был брусок во всю глубину — снаружи он читался как продолжение
 * корпуса до пола. Настоящий цоколь стоит с отступом назад, и его выдаёт
 * именно тень в нише: под гарнитуром видна тёмная щель, а не сплошной борт.
 */
export const PLINTH_RECESS = 55;

export function plinth(widthMm, depthMm) {
  const front = depthMm / 2 - PLINTH_RECESS;

  return [
    // Лицевая планка
    translate(segmentedBox(widthMm - 4, PLINTH, 16, 1), 0, PLINTH / 2, front - 8),
    // Опорные бруски по бокам: держат планку и видны из ниши краем
    ...[-1, 1].map((side) =>
      translate(
        segmentedBox(16, PLINTH, PLINTH_RECESS, 1),
        (side * (widthMm - 60)) / 2,
        PLINTH / 2,
        front - PLINTH_RECESS / 2 - 8,
      ),
    ),
  ];
}

/** Нижний шкаф с распашным фасадом. Корпус неподвижен, дверца — узел. */
export function baseCabinet(widthMm) {
  return {
    white: carcass(widthMm, BASE_CARCASS, BASE_DEPTH, PLINTH),
    graphite: plinth(widthMm, BASE_DEPTH),
  };
}

/**
 * Дверца нижнего шкафа.
 *
 * Петли слева: точка навески на левом откосе, полотно распахивается
 * наружу. Ручка едет вместе с дверцей — она к ней и привинчена.
 */
export function baseCabinetDoor(widthMm) {
  const facadeZ = BASE_DEPTH / 2 + FACADE_THICKNESS / 2;
  const facadeY = PLINTH + BASE_CARCASS / 2;

  return [
    {
      hingeXMm: -widthMm / 2,
      hingeZMm: BASE_DEPTH / 2,
      // Полотно уходит от петли вправо: наружу открывает отрицательный угол
      maxAngleDeg: swingOutDeg(-widthMm / 2, 0),
      parts: {
        oak: facade(widthMm, BASE_CARCASS - FACADE_GAP * 2, facadeY, facadeZ),
        steel: bracketHandle(0, PLINTH + BASE_CARCASS - 90, facadeZ + FACADE_THICKNESS / 2),
      },
    },
  ];
}

/** Раскладка ящиков нижнего модуля: высота фронта и его центр. */
export function baseDrawerLayout(widthMm) {
  const drawerHeight = (BASE_CARCASS - FACADE_GAP * 4) / 3;
  const facadeZ = BASE_DEPTH / 2 + FACADE_THICKNESS / 2;

  return Array.from({ length: 3 }, (_, index) => ({
    widthMm,
    frontHeight: drawerHeight,
    centreY: PLINTH + FACADE_GAP + drawerHeight / 2 + index * (drawerHeight + FACADE_GAP),
    frontZ: facadeZ,
  }));
}

/** Нижний шкаф с тремя ящиками. Корпус неподвижен, ящики — отдельные узлы. */
export function baseDrawers(widthMm) {
  return {
    // У шкафа с ящиками полок нет: внутренний объём занимают короба
    white: carcass(widthMm, BASE_CARCASS, BASE_DEPTH, PLINTH, 0),
    graphite: plinth(widthMm, BASE_DEPTH),
  };
}

/**
 * Ящики нижнего модуля как подвижные детали: фронт, ручка и короб.
 * Короб строится всегда — без него выдвинутый ящик выглядит
 * оторвавшимся фасадом.
 */
export function baseDrawerParts(widthMm) {
  return baseDrawerLayout(widthMm).map((drawer) => {
    const boxDepth = BASE_DEPTH - 60;
    const boxHeight = drawer.frontHeight - 30;
    const bottomMm = drawer.centreY - drawer.frontHeight / 2 + 14;
    // Перед короба прижат к тыльной стороне фронта
    const centreZ = BASE_DEPTH / 2 - boxDepth / 2;

    return {
      travelMm: Math.round(boxDepth * 0.72),
      parts: {
        oak: facade(widthMm, drawer.frontHeight, drawer.centreY, drawer.frontZ),
        white: openBoxPanels(widthMm - 80, boxHeight, boxDepth, { bottomMm }).map((part) =>
          translate(part, 0, 0, centreZ),
        ),
        steel: bracketHandle(0, drawer.centreY, drawer.frontZ + FACADE_THICKNESS / 2, 160),
      },
    };
  });
}

/** Верхний шкаф. Origin остаётся внизу модели, подъём задаёт mountHeightMm. */
export function wallCabinet(widthMm, heightMm) {
  return {
    white: carcass(widthMm, heightMm, WALL_DEPTH, 0),
    // Световая планка по низу: под ней прячут подсветку рабочей зоны,
    // и без неё низ навесного ряда выглядит обрезанным. Целиком выше
    // нуля — origin модели по контракту лежит на её низу (CLAUDE.md)
    graphite: [
      translate(segmentedBox(widthMm - 40, 12, WALL_DEPTH - 40, 1), 0, 6, 6),
      translate(segmentedBox(widthMm, 18, 14, 1), 0, 9, WALL_DEPTH / 2 + FACADE_THICKNESS + 3),
    ],
  };
}

export function wallCabinetDoor(widthMm, heightMm) {
  const facadeZ = WALL_DEPTH / 2 + FACADE_THICKNESS / 2;

  return [
    {
      hingeXMm: -widthMm / 2,
      hingeZMm: WALL_DEPTH / 2,
      maxAngleDeg: swingOutDeg(-widthMm / 2, 0),
      parts: {
        oak: facade(widthMm, heightMm - FACADE_GAP * 2, heightMm / 2, facadeZ),
        steel: bracketHandle(0, 90, facadeZ + FACADE_THICKNESS / 2),
      },
    },
  ];
}

/** Пенал: колонна во всю высоту с двумя фасадами. */
export function tallCabinet(widthMm) {
  const height = 2140;

  return {
    // Пенал высокий: полок больше
    white: carcass(widthMm, height, BASE_DEPTH, PLINTH, 4),
    graphite: plinth(widthMm, BASE_DEPTH),
  };
}

/** Две дверцы пенала: нижняя и верхняя, обе на левых петлях. */
export function tallCabinetDoors(widthMm) {
  const height = 2140;
  const facadeZ = BASE_DEPTH / 2 + FACADE_THICKNESS / 2;
  const lower = 1300;
  const upper = height - lower - FACADE_GAP * 3;
  const hinge = {
    hingeXMm: -widthMm / 2,
    hingeZMm: BASE_DEPTH / 2,
    maxAngleDeg: swingOutDeg(-widthMm / 2, 0),
  };

  return [
    {
      ...hinge,
      parts: {
        oak: facade(widthMm, lower, PLINTH + FACADE_GAP + lower / 2, facadeZ),
        steel: bracketHandle(0, PLINTH + lower - 60, facadeZ + FACADE_THICKNESS / 2),
      },
    },
    {
      ...hinge,
      parts: {
        oak: facade(widthMm, upper, PLINTH + lower + FACADE_GAP * 2 + upper / 2, facadeZ),
        steel: bracketHandle(
          0,
          PLINTH + lower + FACADE_GAP * 2 + 60,
          facadeZ + FACADE_THICKNESS / 2,
        ),
      },
    },
  ];
}

/**
 * Столешница с пристенным плинтусом.
 *
 * Плинтус закрывает стык со стеной: без него столешница выглядит
 * положенной сверху доской, а не частью кухни.
 *
 * Передняя кромка скруглена крупнее остальных: именно её видно с любого
 * места кухни и об неё опираются, а прямой угол на срезе ЛДСП выдаёт
 * необработанную деталь.
 */
export function worktop(widthMm) {
  const depth = 600;
  const offsetZ = (depth - BASE_DEPTH) / 2 - 20;
  const skirtHeight = 60;
  const skirtThickness = 18;
  const front = offsetZ + depth / 2;

  return {
    stone: [
      translate(roundedBox(widthMm, WORKTOP_THICKNESS, depth, 6, 4), 0, WORKTOP_THICKNESS / 2, offsetZ),
      // Валик передней кромки: труба по всей длине заподлицо со срезом
      translate(tubeX(WORKTOP_THICKNESS / 2, widthMm, 10), 0, WORKTOP_THICKNESS / 2, front - WORKTOP_THICKNESS / 2),
      // Пристенный плинтус со скруглённой верхней кромкой
      translate(
        roundedBox(widthMm, skirtHeight, skirtThickness, 5, 3),
        0,
        WORKTOP_THICKNESS + skirtHeight / 2,
        offsetZ - (depth - skirtThickness) / 2,
      ),
    ],
  };
}

/**
 * Врезная мойка с однорычажным смесителем.
 *
 * Ставится на столешницу: собственной отметки нет, высоту даёт опора
 * под указателем.
 *
 * Смеситель собран трубами, а не брусками: изогнутый излив — единственная
 * округлая вещь на всей кухне, и гранёный он читается как деталь
 * конструктора. Слив и перелив показаны кольцами: без них дно чаши
 * выглядит глухой ванночкой.
 */
export function sink() {
  const width = 500;
  const depth = 440;
  const wallHeight = 170;
  const wall = 12;
  const rim = 26;

  const parts = [];
  // Дно чаши и четыре борта
  parts.push(translate(segmentedBox(width, wall, depth, 1), 0, wall / 2, 0));
  for (const side of [-1, 1]) {
    parts.push(
      translate(segmentedBox(wall, wallHeight, depth, 1), (side * (width - wall)) / 2, wallHeight / 2, 0),
    );
    parts.push(
      translate(
        segmentedBox(width - wall * 2, wallHeight, wall, 1),
        0,
        wallHeight / 2,
        (side * (depth - wall)) / 2,
      ),
    );
  }

  // Слив: кольцо решётки на дне чаши
  parts.push(translate(ring(42, 9, 8, 12), 0, wall + 4, 0));
  // Перелив на заднем борту
  parts.push(translate(ring(16, 6, 6, 8), 0, wallHeight - 34, -(depth / 2 - wall - 3)));

  // Бортик по периметру: им мойка ложится на столешницу
  parts.push(
    translate(roundedBox(width + rim * 2, 10, depth + rim * 2, 3, 2), 0, wallHeight + 5, 0),
  );

  // Смеситель: стойка, изогнутый излив и рычаг
  const tapZ = -(depth / 2 + rim / 2);
  const tapBase = wallHeight + 10;
  parts.push(translate(cylinder(26, 16, 14), 0, tapBase + 8, tapZ));
  parts.push(translate(cylinder(17, 250, 14), 0, tapBase + 125, tapZ));

  // Излив выгибается тремя звеньями: колено, дуга и носик вниз
  parts.push(translate(tubeZ(15, 60, 12), 0, tapBase + 268, tapZ + 22));
  parts.push(translate(tubeZ(15, 120, 12), 0, tapBase + 252, tapZ + 100));
  parts.push(translate(cylinder(14, 46, 12), 0, tapBase + 228, tapZ + 158));
  // Аэратор на конце носика
  parts.push(translate(cylinder(16, 12, 12), 0, tapBase + 200, tapZ + 158));

  // Рычаг: наклонная ручка сбоку от стойки
  parts.push(translate(tubeZ(9, 96, 8), 0, tapBase + 150, tapZ + 44));

  return { steel: parts };
}

/**
 * Индукционная варочная панель: стекло с контурами зон и сенсорами.
 *
 * Диски вместо контуров читались как четыре монеты, положенные сверху:
 * у индукционной панели зона обозначена НАРИСОВАННЫМ кольцом заподлицо
 * со стеклом, а не выступающей блямбой. Отсюда кольца, а не цилиндры.
 *
 * Как и мойка, встаёт на ту поверхность, в которую целятся.
 */
export function hob() {
  const width = 580;
  const depth = 510;
  const glassHeight = 12;

  // Рамка из стали по периметру: ею панель прижата к столешнице
  const frame = [translate(roundedBox(width, 8, depth, 3, 2), 0, 4, 0)];
  const glass = [translate(roundedBox(width - 16, glassHeight, depth - 16, 2, 2), 0, 8, 0)];

  const marks = [];
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      const x = dx * (width / 4);
      const z = dz * (depth / 4 - 10);
      // Контур зоны нагрева и точка её центра
      marks.push(translate(ring(88, 5, 3, 12), x, glassHeight + 3, z));
      marks.push(translate(ring(20, 4, 3, 8), x, glassHeight + 3, z));
    }
  }

  // Сенсорная панель управления по переднему краю
  marks.push(
    translate(segmentedBox(width - 200, 3, 44, 1), 0, glassHeight + 3, depth / 2 - 44),
  );

  return { graphite: glass, steel: [...frame, ...marks] };
}

/** Отдельная деталь: фасад или дверца с ручкой. */
export function loosePanel(widthMm, heightMm, withHandle) {
  const parts = {
    oak: panelFacade(widthMm, heightMm, FACADE_THICKNESS, {
      x: 0,
      y: heightMm / 2,
      z: 0,
    }),
  };
  if (withHandle) {
    parts.steel = bracketHandle(0, heightMm - 90, FACADE_THICKNESS / 2);
  }
  return parts;
}

/** Ящик как деталь: короб с фронтом. */
export function drawerBox(widthMm) {
  const height = 176;
  const depth = 500;
  return {
    // Настоящий короб: боковины, дно и задний борт, перед закрыт фасадом
    white: openBoxPanels(widthMm - 40, height, depth, { bottomMm: 0 }),
    oak: flatFacade(widthMm, height, FACADE_THICKNESS, { x: 0, y: height / 2, z: depth / 2 - 10 }),
    steel: bracketHandle(0, height / 2, depth / 2 - 10 + FACADE_THICKNESS / 2, 160),
  };
}

/**
 * Ручка как отдельная позиция каталога.
 * Центр рейлинга поднят на его полутолщину: origin модели обязан лежать
 * на низе габарита, иначе деталь висит над полом (CLAUDE.md, конвенции).
 */
export function handle(spanMm) {
  return { steel: bracketHandle(0, 8, 0, spanMm) };
}

/**
 * `mountHeightMm` — высота установки низа модели над полом.
 * `snapToWall` — участвует ли в привязке к стенам: россыпь мелких
 * деталей к стене не липнет, иначе ручка прыгала бы через всю кухню.

/** Слияние деталей одного материала — по одному примитиву на материал. */
export function mergeParts(parts) {
  return Object.entries(parts)
    .filter(([, pieces]) => pieces.length > 0)
    .map(([material, pieces]) => ({ material, geometry: mergeGeometries(pieces) }));
}
