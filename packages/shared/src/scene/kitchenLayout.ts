import { roomBounds } from './bounds';
import { deterministicUuid, randomUUID } from './uuid';
import type { CatalogProduct } from '../catalog/schema';
import type { Placement, Room } from './schema';
import type { Vec2 } from './walls';

/**
 * Готовые сценарии кухни.
 *
 * Пустая сцена пугает: покупатель открывает планировщик и не знает, с
 * чего начать. Готовая раскладка даёт кухню за один тап, а дальше её
 * правят перетаскиванием — это быстрее и понятнее, чем собирать ряд
 * из отдельных тумб.
 *
 * Раскладка считается по фактическим габаритам помещения и по тому, что
 * есть в каталоге тенанта: жёстко прошитый набор артикулов развалился бы
 * на первом же магазине.
 */

export type KitchenLayoutKind = 'linear' | 'corner' | 'u-shape';

export interface KitchenLayout {
  kind: KitchenLayoutKind;
  name: string;
  description: string;
  /** Минимальная длина стены, короче которой раскладка не собирается */
  minRunMm: number;
}

export const KITCHEN_LAYOUTS: readonly KitchenLayout[] = [
  {
    kind: 'linear',
    name: 'Прямая',
    description: 'Один ряд вдоль стены. Подходит узкой кухне',
    minRunMm: 1800,
  },
  {
    kind: 'corner',
    name: 'Угловая',
    description: 'Два ряда по смежным стенам. Самая ходовая раскладка',
    minRunMm: 1800,
  },
  {
    kind: 'u-shape',
    name: 'П-образная',
    description: 'Три ряда. Нужна комната от 2.6 м по короткой стороне',
    minRunMm: 2600,
  },
];

/** Ряд: отрезок стены, вдоль которого выстраиваются модули. */
interface Run {
  start: Vec2;
  /** Единичное направление вдоль стены */
  along: Vec2;
  /** Единичная нормаль внутрь помещения: туда смотрят фасады */
  normal: Vec2;
  lengthMm: number;
}

/**
 * Разворот изделия, при котором фасад смотрит внутрь помещения.
 *
 * Локальная +Z модели — это её перёд, а поворот вокруг Y переводит +Z
 * в (sin θ, cos θ). Отсюда и угол.
 */
function facing(normal: Vec2): number {
  return Math.round((Math.atan2(normal.x, normal.y) * 180) / Math.PI);
}

const byWidthDesc = (a: CatalogProduct, b: CatalogProduct): number => b.widthMm - a.widthMm;

function pickByRole(products: readonly CatalogProduct[], role: CatalogProduct['role']): CatalogProduct[] {
  return products.filter((product) => product.role === role).sort(byWidthDesc);
}

/**
 * Заполнение ряда модулями.
 *
 * Берётся самый широкий модуль, который ещё влезает: так меньше стыков,
 * а остаток в конце ряда закрывается узким. Ряд, куда не влезает ничего,
 * остаётся пустым — это честнее, чем ставить модуль внахлёст.
 */
function fillRun(
  run: Run,
  modules: readonly CatalogProduct[],
  offsetMm: number,
  make: (product: CatalogProduct, centre: Vec2, rotationDeg: number) => void,
): number {
  if (modules.length === 0) return offsetMm;

  let cursor = offsetMm;
  const rotation = facing(run.normal);

  for (let guard = 0; guard < 32; guard++) {
    const rest = run.lengthMm - cursor;
    const product = modules.find((candidate) => candidate.widthMm <= rest);
    if (!product) break;

    const alongMm = cursor + product.widthMm / 2;
    const outMm = product.depthMm / 2;
    make(
      product,
      {
        x: run.start.x + run.along.x * alongMm + run.normal.x * outMm,
        y: run.start.y + run.along.y * alongMm + run.normal.y * outMm,
      },
      rotation,
    );
    cursor += product.widthMm;
  }

  return cursor;
}

/**
 * Ряды раскладки внутри прямоугольника помещения.
 *
 * Второй и третий ряды начинаются с отступом на глубину соседнего:
 * иначе модули в углу встают друг в друга, и собрать такую кухню
 * невозможно.
 */
function runsFor(
  kind: KitchenLayoutKind,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  depthMm: number,
): Run[] {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;

  // Главный ряд идёт вдоль длинной стены: там помещается больше
  const alongX = width >= depth;
  const main: Run = alongX
    ? {
        start: { x: bounds.minX, y: bounds.minZ },
        along: { x: 1, y: 0 },
        normal: { x: 0, y: 1 },
        lengthMm: width,
      }
    : {
        start: { x: bounds.minX, y: bounds.maxZ },
        along: { x: 0, y: -1 },
        normal: { x: 1, y: 0 },
        lengthMm: depth,
      };

  if (kind === 'linear') return [main];

  const side: Run = alongX
    ? {
        start: { x: bounds.minX, y: bounds.minZ + depthMm },
        along: { x: 0, y: 1 },
        normal: { x: 1, y: 0 },
        lengthMm: depth - depthMm,
      }
    : {
        start: { x: bounds.minX + depthMm, y: bounds.maxZ },
        along: { x: 1, y: 0 },
        normal: { x: 0, y: -1 },
        lengthMm: width - depthMm,
      };

  if (kind === 'corner') return [main, side];

  const opposite: Run = alongX
    ? {
        start: { x: bounds.maxX, y: bounds.minZ + depthMm },
        along: { x: 0, y: 1 },
        normal: { x: -1, y: 0 },
        lengthMm: depth - depthMm,
      }
    : {
        start: { x: bounds.minX + depthMm, y: bounds.minZ },
        along: { x: 1, y: 0 },
        normal: { x: 0, y: 1 },
        lengthMm: width - depthMm,
      };

  return [main, side, opposite];
}

export interface KitchenResult {
  placements: Placement[];
  /** Почему раскладка не собралась. Пусто — всё в порядке */
  problems: string[];
}

/**
 * Сборка кухни по сценарию.
 *
 * Возвращает готовые размещения, а не меняет документ: решение,
 * добавить их или отменить, принимает вызывающий код.
 */
export function buildKitchen(
  kind: KitchenLayoutKind,
  room: Room,
  products: readonly CatalogProduct[],
): KitchenResult {
  const bounds = roomBounds([room]);
  const layout = KITCHEN_LAYOUTS.find((item) => item.kind === kind);
  if (!bounds || !layout) return { placements: [], problems: ['Нет помещения'] };

  const bases = pickByRole(products, 'base');
  const walls = pickByRole(products, 'wall');
  const worktops = pickByRole(products, 'worktop');
  const sink = pickByRole(products, 'sink')[0];
  const hob = pickByRole(products, 'hob')[0];

  if (bases.length === 0) return { placements: [], problems: ['В каталоге нет нижних модулей'] };

  const problems: string[] = [];
  const placements: Placement[] = [];
  const add = (product: CatalogProduct, centre: Vec2, rotationDeg: number, yMm: number): void => {
    placements.push({
      instanceId: randomUUID(),
      productId: deterministicUuid(product.sku),
      sku: product.sku,
      position: { x: Math.round(centre.x), y: Math.round(yMm), z: Math.round(centre.y) },
      rotationY: rotationDeg,
      options: {},
      params: {},
      anchoredToWallId: null,
      locked: false,
    });
  };

  const baseDepth = bases[0]!.depthMm;
  const runs = runsFor(kind, bounds, baseDepth).filter((run) => run.lengthMm >= layout.minRunMm);
  if (runs.length === 0) {
    return { placements: [], problems: ['Помещение слишком мало для этой раскладки'] };
  }

  const worktopSpots: { centre: Vec2; rotation: number }[] = [];

  for (const run of runs) {
    fillRun(run, bases, 0, (product, centre, rotation) => {
      add(product, centre, rotation, 0);
      worktopSpots.push({ centre, rotation });
    });

    // Столешница накрывает ряд целиком
    if (worktops.length > 0) {
      fillRun(run, worktops, 0, (product, centre, rotation) => {
        add(product, centre, rotation, product.mountHeightMm);
      });
    } else {
      problems.push('В каталоге нет столешниц');
    }
  }

  // Верхний ряд только над главной стеной: навесные шкафы над каждой
  // стеной делают кухню коробкой без света
  const [main] = runs;
  if (main && walls.length > 0) {
    fillRun(main, walls, 0, (product, centre, rotation) => {
      add(product, centre, rotation, product.mountHeightMm);
    });
  }

  // Мойка и плита ставятся на столешницу с разносом: рабочая
  // поверхность между ними — требование эргономики, а не украшение
  const top = worktops[0];
  const worktopTop = top ? top.mountHeightMm + (top.surfaceHeightMm ?? top.heightMm) : 858;
  const spots = worktopSpots.filter((_, index) => index > 0);
  if (sink && spots.length > 0) {
    const spot = spots[Math.floor(spots.length * 0.25)]!;
    add(sink, spot.centre, spot.rotation, worktopTop);
  }
  if (hob && spots.length > 2) {
    const spot = spots[Math.floor(spots.length * 0.75)]!;
    add(hob, spot.centre, spot.rotation, worktopTop);
  }

  return { placements, problems };
}
