/**
 * Корпусная и мягкая мебель демо-тенанта `test`.
 *
 * Отделено от каталога по тому же принципу, что кухня, техника и полы:
 * каталог сводит изделия воедино и умеет собирать из них геометрию,
 * а как выглядит конкретный шкаф — забота своего модуля.
 *
 * Все размеры — миллиметры целыми (CLAUDE.md, конвенции).
 * Origin каждой модели — низ-центр габарита.
 */
import { cylinder, roundedBox, segmentedBox, translate } from './geometry.mjs';
import { PANEL_THICKNESS, carcassPanels, openBoxPanels } from './carcass.mjs';
import { taperedLegs } from './legs.mjs';
import { panelFacade } from './facade.mjs';

/** Вертикальная ручка-рейлинг. */
function verticalHandle(xMm, yMm, zMm, lengthMm) {
  return translate(cylinder(9, lengthMm, 10), xMm, yMm, zMm);
}

/** Горизонтальная ручка: цилиндр строится по оси Y, поэтому берём брусок. */
function horizontalHandle(xMm, yMm, zMm, lengthMm) {
  return translate(segmentedBox(lengthMm, 18, 18, 2), xMm, yMm, zMm);
}

const WARDROBE = { width: 1200, height: 2200, depth: 600, plinth: 90 };

/** Раскладка распашных дверец шкафа: две створки на своих петлях. */
function wardrobeDoors() {
  const { width, height, depth, plinth } = WARDROBE;
  const corpusHeight = height - plinth;
  const doorWidth = width / 2 - 12;
  const doorHeight = corpusHeight - 40;
  const doorY = plinth + corpusHeight / 2;
  const doorZ = depth / 2 + 9;

  // Петли по краям, ручки у середины: створки расходятся в стороны
  return [-1, 1].map((side) => ({
    hingeXMm: (side * width) / 2,
    hingeZMm: depth / 2,
    maxAngleDeg: side < 0 ? 110 : -110,
    parts: {
      oak: panelFacade(doorWidth, doorHeight, 18, {
        x: side * (doorWidth / 2 + 6),
        y: doorY,
        z: doorZ,
      }),
      steel: [verticalHandle(side * 30, doorY, doorZ + 20, 900)],
    },
  }));
}

function wardrobe() {
  const { width, height, depth, plinth } = WARDROBE;
  const corpusHeight = height - plinth;

  return {
    // Корпус из панелей, а не брусок: у шкафа появляются толщина
    // стенок, внутренний объём и полки
    white: carcassPanels(width, corpusHeight, depth, { bottomMm: plinth, shelves: 3 }),
    // Ножки вместо глухого цоколя: под шкафом виден пол, и корпус
    // перестаёт читаться встроенным коробом
    graphite: taperedLegs(width, depth, { heightMm: plinth }),
  };
}

/**
 * Комод. Габариты и раскладка ящиков вынесены отдельно: по ним строится
 * и корпус, и подвижные короба — иначе фронт и ящик разъедутся при первой
 * же правке размеров.
 */
const SIDEBOARD = {
  width: 1200,
  height: 780,
  depth: 450,
  legHeight: 80,
  drawerCount: 3,
  gap: 14,
};

/** Раскладка ящиков комода: высота фронта и его центр по вертикали. */
function sideboardDrawerLayout() {
  const { width, height, depth, legHeight, drawerCount, gap } = SIDEBOARD;
  const corpusHeight = height - legHeight;
  const frontHeight = corpusHeight / drawerCount - gap;

  return Array.from({ length: drawerCount }, (_, index) => ({
    frontHeight,
    centreY: legHeight + frontHeight / 2 + 10 + index * (frontHeight + gap),
    frontZ: depth / 2 + 9,
    width,
    depth,
  }));
}

function sideboard() {
  const { width, height, depth, legHeight } = SIDEBOARD;
  const corpusHeight = height - legHeight;

  return {
    // Ящики занимают весь объём, полок внутри нет
    white: carcassPanels(width, corpusHeight, depth, { bottomMm: legHeight }),
    graphite: taperedLegs(width, depth, { heightMm: legHeight }),
  };
}

/**
 * Ящики комода как подвижные детали.
 *
 * Каждый ящик — отдельный узел в GLB: фронт с ручкой и короб за ним.
 * Без короба выдвинутый ящик выглядит оторвавшимся фасадом, поэтому
 * он строится даже при том, что в закрытом виде его не видно.
 */
function sideboardDrawers() {
  return sideboardDrawerLayout().map((drawer) => {
    const front = translate(
      roundedBox(drawer.width - 40, drawer.frontHeight, 18, 5, 5),
      0,
      drawer.centreY,
      drawer.frontZ,
    );
    const box = drawerBoxBehind(drawer);

    return {
      travelMm: Math.round(box.depthMm * 0.72),
      parts: {
        oak: [front],
        white: box.parts,
        steel: [
          horizontalHandle(0, drawer.centreY + drawer.frontHeight / 2 - 40, drawer.frontZ + 17, 320),
        ],
      },
    };
  });
}

/**
 * Короб ящика, приставленный вплотную к тыльной стороне фронта.
 * Уже корпуса на зазор под направляющие с обеих сторон.
 */
function drawerBoxBehind(drawer) {
  const clearance = 34;
  const widthMm = drawer.width - PANEL_THICKNESS * 2 - clearance * 2;
  const depthMm = drawer.depth - 40;
  const heightMm = drawer.frontHeight - 24;
  const bottomMm = drawer.centreY - drawer.frontHeight / 2 + 12;
  // Перед короба совпадает с внутренней плоскостью фронта
  const centreZ = drawer.depth / 2 - depthMm / 2;

  const parts = openBoxPanels(widthMm, heightMm, depthMm, { bottomMm }).map((part) =>
    translate(part, 0, 0, centreZ),
  );

  return { parts, depthMm };
}

function table() {
  const width = 1400;
  const depth = 800;
  const topThickness = 40;
  const legHeight = 720 - topThickness;
  const inset = 90;

  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      legs.push(
        translate(
          cylinder(32, legHeight, 14),
          sx * (width / 2 - inset),
          legHeight / 2,
          sz * (depth / 2 - inset),
        ),
      );
    }
  }

  return {
    oak: [translate(roundedBox(width, topThickness, depth, 12, 8), 0, legHeight + topThickness / 2, 0)],
    steel: legs,
  };
}

function chair() {
  const seatHeight = 450;
  const seatThickness = 90;
  const legHeight = seatHeight - seatThickness;

  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      legs.push(translate(cylinder(18, legHeight, 12), sx * 180, legHeight / 2, sz * 180));
    }
  }

  return {
    fabric: [
      translate(roundedBox(460, seatThickness, 460, 24, 8), 0, legHeight + seatThickness / 2, 0),
      translate(roundedBox(420, 480, 70, 24, 8), 0, seatHeight + 240, -195),
    ],
    steel: legs,
  };
}

function sofa() {
  const width = 2040;
  const depth = 900;
  const baseHeight = 320;
  const legHeight = 120;
  const armWidth = 200;

  const seatWidth = (width - armWidth * 2) / 3 - 20;
  const cushions = [];
  const backs = [];
  for (let i = 0; i < 3; i++) {
    const centerX = -(width - armWidth * 2) / 2 + seatWidth / 2 + 10 + i * (seatWidth + 20);
    // Сегментов больше, чем у корпусов: подушки — самая тяжёлая часть модели,
    // на них и проверяется, что LOD-упрощение действительно режет геометрию
    cushions.push(translate(roundedBox(seatWidth, 170, 720, 55, 10), centerX, legHeight + baseHeight + 85, 40));
    backs.push(translate(roundedBox(seatWidth, 430, 190, 55, 10), centerX, legHeight + baseHeight + 300, -330));
  }

  const legs = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      legs.push(translate(cylinder(22, legHeight, 10), sx * (width / 2 - 140), legHeight / 2, sz * (depth / 2 - 140)));
    }
  }

  return {
    fabric: [
      translate(segmentedBox(width, baseHeight, depth, 4), 0, legHeight + baseHeight / 2, 0),
      translate(roundedBox(armWidth, 550, depth, 60, 10), -(width / 2 - armWidth / 2), legHeight + 275, 0),
      translate(roundedBox(armWidth, 550, depth, 60, 10), width / 2 - armWidth / 2, legHeight + 275, 0),
      ...cushions,
      ...backs,
    ],
    steel: legs,
  };
}

/**
 * Изделия тенанта. `build()` возвращает карту «материал -> список деталей»:
 * детали одного материала сливаются в один примитив, иначе каждая ножка
 * стоила бы отдельного draw call.
 *
 * `mountHeightMm` — высота установки низа модели: верхние шкафы висят,
 * а не стоят на полу. `snapToWall` — участвует ли объект в привязке
 * к стенам.
 */
export const FURNITURE = [
  {
    sku: 'TEST-WRD-1200',
    resize: { minWidthMm: 600, maxWidthMm: 2400, minHeightMm: 1800, maxHeightMm: 2600 },
    role: 'furniture',
    name: 'Шкаф «Орион» 1200',
    category: 'Шкафы',
    type: 'static',
    basePriceCents: 5490000,
    build: wardrobe,
    doors: wardrobeDoors,
  },
  {
    sku: 'TEST-SBD-1200',
    resize: { minWidthMm: 600, maxWidthMm: 2000 },
    role: 'furniture',
    name: 'Комод «Орион» 1200',
    category: 'Комоды',
    type: 'static',
    basePriceCents: 2790000,
    build: sideboard,
    drawers: sideboardDrawers,
  },
  {
    sku: 'TEST-TBL-1400',
    resize: { minWidthMm: 800, maxWidthMm: 2400 },
    role: 'furniture',
    name: 'Стол «Норд» 1400',
    category: 'Столы',
    type: 'static',
    basePriceCents: 3190000,
    build: table,
  },
  {
    sku: 'TEST-CHR-460',
    role: 'furniture',
    name: 'Стул «Норд»',
    category: 'Стулья',
    type: 'static',
    basePriceCents: 890000,
    build: chair,
  },
  {
    sku: 'TEST-SFA-2040',
    role: 'furniture',
    name: 'Диван «Ленокс» 2040',
    category: 'Диваны',
    type: 'static',
    basePriceCents: 8990000,
    build: sofa,
  },
];
