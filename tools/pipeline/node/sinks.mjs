/**
 * Врезные мойки со смесителями.
 *
 * Мойку не ставят НА столешницу — её врезают. Снаружи остаётся только
 * бортик заподлицо с камнем, а чаша уходит вниз, в тумбу. Прежняя модель
 * стояла ванночкой сверху и выдавала себя с первого взгляда.
 *
 * Отсюда устройство модели: origin по низу чаши (CLAUDE.md), бортик —
 * сверху габарита, а насколько изделие утоплено, говорит recessMm
 * в карточке каталога.
 *
 * Чаша и смеситель собраны РАЗНЫМИ материалами: их красят раздельно.
 *
 * Все размеры в миллиметрах.
 */
import {
  cylinder,
  mergeGeometries,
  ring,
  roundedBox,
  segmentedBox,
  taperedBox,
  translate,
  tubeZ,
} from './geometry.mjs';

/** Толщина бортика: им мойка ложится на камень. */
const RIM = 9;
/** Ширина полки бортика вокруг чаши. */
const FLANGE = 26;
/** Толщина стенки чаши. */
const WALL = 9;

/**
 * Чаша: сужающийся книзу короб с дном и сливом.
 *
 * Настоящая чаша сужается — так вода сходит к сливу, и так её штампуют.
 * Прямой короб читается коробкой из-под обуви.
 */
function bowl(widthMm, depthMm, heightMm, centreXMm = 0) {
  const parts = [];
  const taper = 34;
  const innerW = widthMm - WALL * 2;
  const innerD = depthMm - WALL * 2;

  // Наружная оболочка чаши
  parts.push(
    translate(
      taperedBox(widthMm, depthMm, widthMm - taper, depthMm - taper, heightMm, {
        segments: 2,
        capTop: false,
        capBottom: true,
      }),
      centreXMm,
      0,
      0,
    ),
  );
  // Внутренняя стенка: без неё чаша выглядит литой болванкой
  parts.push(
    translate(
      taperedBox(innerW - taper, innerD - taper, innerW, innerD, heightMm - WALL, {
        segments: 2,
        capTop: false,
        capBottom: false,
      }),
      centreXMm,
      WALL,
      0,
    ),
  );
  // Дно
  parts.push(
    translate(
      segmentedBox(innerW - taper, WALL, innerD - taper, 1),
      centreXMm,
      WALL / 2 + 1,
      0,
    ),
  );

  return parts;
}

/** Решётка слива и перелив: по ним чаша читается рабочей, а не литой. */
function drain(centreXMm, heightMm, depthMm) {
  return [
    translate(ring(38, 8, 7, 12), centreXMm, WALL + 5, 0),
    translate(ring(15, 5, 5, 8), centreXMm, heightMm - 42, -(depthMm / 2 - WALL - 4)),
  ];
}

/**
 * Бортик по периметру изделия.
 *
 * Верх бортика — это плоскость столешницы: по ней мойка и садится
 * в вырез. Ниже бортика начинается то, что уходит в тумбу.
 */
function flange(widthMm, depthMm, topMm) {
  return [translate(roundedBox(widthMm, RIM, depthMm, 3, 2), 0, topMm - RIM / 2, 0)];
}

/**
 * Смеситель с изогнутым изливом.
 *
 * Единственная округлая вещь на всей кухне, и гранёная она читается
 * деталью конструктора — поэтому трубы, а не бруски.
 */
function tap(baseYMm, tapZMm, { height = 250, reach = 158, lever = true } = {}) {
  const parts = [
    translate(cylinder(26, 16, 14), 0, baseYMm + 8, tapZMm),
    translate(cylinder(17, height, 14), 0, baseYMm + height / 2, tapZMm),
    // Излив выгибается тремя звеньями: колено, дуга и носик вниз
    translate(tubeZ(15, 60, 12), 0, baseYMm + height + 18, tapZMm + 22),
    translate(tubeZ(15, 120, 12), 0, baseYMm + height + 2, tapZMm + reach - 58),
    translate(cylinder(14, 46, 12), 0, baseYMm + height - 22, tapZMm + reach),
    translate(cylinder(16, 12, 12), 0, baseYMm + height - 50, tapZMm + reach),
  ];
  if (lever) {
    parts.push(translate(tubeZ(9, 96, 8), 0, baseYMm + height - 100, tapZMm + 44));
  }
  return parts;
}

/** Профессиональный смеситель: высокая дуга и пружина. */
function springTap(baseYMm, tapZMm) {
  const height = 300;
  const parts = [
    translate(cylinder(28, 18, 14), 0, baseYMm + 9, tapZMm),
    translate(cylinder(19, height, 14), 0, baseYMm + height / 2, tapZMm),
    // Пружина: кольца по высоте стойки
    ...Array.from({ length: 7 }, (_, i) =>
      translate(ring(28, 7, 7, 10), 0, baseYMm + 96 + i * 26, tapZMm),
    ),
    translate(tubeZ(16, 84, 12), 0, baseYMm + height + 22, tapZMm + 40),
    translate(cylinder(18, 96, 12), 0, baseYMm + height - 26, tapZMm + 78),
    translate(tubeZ(9, 90, 8), 0, baseYMm + height - 130, tapZMm + 40),
  ];
  return parts;
}

/** Сборка изделия: чаша и кран разными материалами. */
const assemble = (sinkParts, tapParts) => ({
  sinkSteel: [mergeGeometries(sinkParts)],
  tapChrome: [mergeGeometries(tapParts)],
});

/** Одна квадратная чаша: самая ходовая врезная мойка. */
export function squareSink() {
  const width = 500;
  const depth = 440;
  const bowlHeight = 185;
  const total = bowlHeight + RIM;
  const outer = { w: width + FLANGE * 2, d: depth + FLANGE * 2 };
  const tapZ = -(outer.d / 2 - 34);

  return assemble(
    [...bowl(width, depth, bowlHeight), ...drain(0, bowlHeight, depth), ...flange(outer.w, outer.d, total)],
    tap(total, tapZ),
  );
}

/** Круглая чаша: для узкой столешницы и угловой тумбы. */
export function roundSink() {
  const radius = 230;
  const bowlHeight = 175;
  const total = bowlHeight + RIM;
  const outer = radius * 2 + FLANGE * 2;
  const tapZ = -(outer / 2 - 34);

  const parts = [
    // Чаша точением: конус со стенкой и дном
    translate(cylinder(radius, bowlHeight, 28), 0, bowlHeight / 2, 0),
    translate(cylinder(radius - WALL, bowlHeight - WALL, 28), 0, bowlHeight / 2 + WALL, 0),
    translate(ring(36, 8, 7, 12), 0, WALL + 5, 0),
    translate(cylinder(radius + FLANGE, RIM, 32), 0, total - RIM / 2, 0),
  ];

  return assemble(parts, tap(total, tapZ, { height: 270 }));
}

/** Две чаши: основная и вспомогательная под ополаскивание. */
export function doubleSink() {
  const main = { w: 400, d: 420 };
  const side = { w: 300, d: 420 };
  const bowlHeight = 180;
  const total = bowlHeight + RIM;
  const gap = 40;
  const outer = {
    w: main.w + side.w + gap + FLANGE * 2,
    d: main.d + FLANGE * 2,
  };
  const mainX = -(side.w + gap) / 2;
  const sideX = (main.w + gap) / 2;
  const tapZ = -(outer.d / 2 - 34);

  return assemble(
    [
      ...bowl(main.w, main.d, bowlHeight, mainX),
      ...drain(mainX, bowlHeight, main.d),
      ...bowl(side.w, side.d, bowlHeight - 30, sideX),
      ...drain(sideX, bowlHeight - 30, side.d),
      ...flange(outer.w, outer.d, total),
    ],
    tap(total, tapZ, { height: 260 }),
  );
}

/**
 * Чаша с крылом: на крыло ставят мокрую посуду.
 *
 * Крыло — это рифлёная полка на уровне бортика с уклоном к чаше,
 * и рёбра на ней обязательны: без них это просто плоская плита.
 */
export function drainerSink() {
  const bowlSize = { w: 420, d: 420 };
  const wing = 360;
  const bowlHeight = 185;
  const total = bowlHeight + RIM;
  const outer = { w: bowlSize.w + wing + FLANGE * 2, d: bowlSize.d + FLANGE * 2 };
  const bowlX = -(wing / 2);
  const wingX = (bowlSize.w + FLANGE) / 2 + 6;
  const tapZ = -(outer.d / 2 - 34);

  const ribs = [];
  for (let i = 0; i < 5; i++) {
    ribs.push(
      translate(
        roundedBox(wing - 70, 5, 13, 2, 2),
        wingX,
        total - 1,
        -outer.d / 2 + 70 + i * 62,
      ),
    );
  }

  return assemble(
    [
      ...bowl(bowlSize.w, bowlSize.d, bowlHeight, bowlX),
      ...drain(bowlX, bowlHeight, bowlSize.d),
      ...flange(outer.w, outer.d, total),
      ...ribs,
    ],
    springTap(total, tapZ),
  );
}

/** Насколько изделие уходит вниз от плоскости столешницы. */
export const SINK_RECESS = {
  square: 185,
  round: 175,
  double: 180,
  drainer: 185,
};

/**
 * Окно, которое выпиливают в столешнице под каждую мойку.
 *
 * Задаётся изделием, а не считается вьюером по габариту: у круглой
 * мойки бортик круглый, и квадратное окно «габарит минус припуск»
 * вылезло бы из-под него углами — сквозь столешницу было бы видно
 * тумбу. Окно вписано в бортик, а не обведено по габариту.
 *
 * У мойки с крылом окно только под чашей: крыло лежит на камне целиком.
 */
export const SINK_CUTOUT = {
  // Квадратная 500×440 с бортиком 26: окно по чаше
  square: { widthMm: 500, depthMm: 440 },
  // Круглая r=230, бортик до 256: квадрат, вписанный в окружность чаши
  round: { widthMm: 324, depthMm: 324 },
  // Две чаши 400 и 300 с промежутком 40: одно окно на обе
  double: { widthMm: 740, depthMm: 420 },
  // Только под чашей: крыло опирается на камень
  drainer: { widthMm: 420, depthMm: 420, offsetXMm: -180 },
};
