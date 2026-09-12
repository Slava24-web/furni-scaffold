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

/** Место под модуль в ряду. */
interface Slot {
  run: Run;
  alongMm: number;
  widthMm: number;
}

/**
 * Разбиение ряда на места под модули.
 *
 * Берётся самый широкий модуль, который ещё влезает: так меньше стыков.
 * Остаток в конце ряда добирается позже — растяжением последнего
 * СВОБОДНОГО места. Тянуть место под технику нельзя: у неё габарит
 * стандартный.
 */
function planSlots(run: Run, modules: readonly CatalogProduct[]): Slot[] {
  if (modules.length === 0) return [];

  const slots: Slot[] = [];
  let cursor = 0;

  for (let guard = 0; guard < 32; guard++) {
    const rest = run.lengthMm - cursor;
    const product = modules.find((candidate) => candidate.widthMm <= rest);
    if (!product) break;

    slots.push({ run, alongMm: cursor, widthMm: product.widthMm });
    cursor += product.widthMm;
  }

  return slots;
}

/**
 * Вырезание участка из отрезков ряда.
 *
 * Нужно там, где место занято не модулем: под вытяжкой шкафа быть не
 * должно, а обрезок короче узкого модуля не нужен вовсе.
 */
function cutOut(spans: readonly Slot[], fromMm: number, toMm: number): Slot[] {
  const result: Slot[] = [];

  for (const span of spans) {
    const end = span.alongMm + span.widthMm;
    if (toMm <= span.alongMm || fromMm >= end) {
      result.push(span);
      continue;
    }

    if (fromMm > span.alongMm) {
      result.push({ run: span.run, alongMm: span.alongMm, widthMm: fromMm - span.alongMm });
    }
    if (toMm < end) {
      result.push({ run: span.run, alongMm: toMm, widthMm: end - toMm });
    }
  }

  return result;
}

/** Центр модуля, стоящего в этом месте ряда. */
function slotCentre(slot: Slot, depthMm: number): Vec2 {
  const { run } = slot;
  const alongMm = slot.alongMm + slot.widthMm / 2;
  const outMm = depthMm / 2;

  return {
    x: run.start.x + run.along.x * alongMm + run.normal.x * outMm,
    y: run.start.y + run.along.y * alongMm + run.normal.y * outMm,
  };
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
  /**
   * Техника берётся самая узкая из ряда.
   *
   * Стандартный фронт 600 влезает в любую кухню, а Side-by-Side на 900
   * в маленькой съедает половину ряда. Широкое пусть ставят руками.
   */
  const narrowest = (role: CatalogProduct['role']): CatalogProduct | undefined =>
    pickByRole(products, role).at(-1);

  if (bases.length === 0) return { placements: [], problems: ['В каталоге нет нижних модулей'] };

  const problems: string[] = [];
  const placements: Placement[] = [];
  const add = (
    product: CatalogProduct,
    centre: Vec2,
    rotationDeg: number,
    yMm: number,
    size: Placement['size'] = {},
  ): void => {
    placements.push({
      instanceId: randomUUID(),
      productId: deterministicUuid(product.sku),
      sku: product.sku,
      position: { x: Math.round(centre.x), y: Math.round(yMm), z: Math.round(centre.y) },
      rotationY: rotationDeg,
      options: {},
      params: {},
      size,
      anchoredToWallId: null,
      locked: false,
    });
  };

  const baseDepth = bases[0]!.depthMm;
  // Соседний ряд отступает на глубину САМОГО глубокого изделия: холодильник
  // глубже модулей, и по глубине корпуса ряды сошлись бы углами
  const cornerDepth = Math.max(baseDepth, narrowest('fridge')?.depthMm ?? 0);
  const runs = runsFor(kind, bounds, cornerDepth).filter((run) => run.lengthMm >= layout.minRunMm);
  if (runs.length === 0) {
    return { placements: [], problems: ['Помещение слишком мало для этой раскладки'] };
  }

  const fridge = narrowest('fridge');
  const dishwasher = narrowest('dishwasher');
  const oven = narrowest('oven');
  const sink = narrowest('sink');
  const hob = narrowest('hob');
  // Вытяжка подбирается под плиту: узкая над широкой плитой не тянет
  const hood = hob
    ? pickByRole(products, 'hood')
        .slice()
        .sort(
          (a, b) => Math.abs(a.widthMm - hob.widthMm) - Math.abs(b.widthMm - hob.widthMm),
        )[0]
    : undefined;

  /**
   * Порядок изделий в главном ряду.
   *
   * Мойка ближе к началу, посудомойка сразу за ней — их подключают к
   * одному сливу. Духовка отдельным местом, плита встаёт над ней.
   * Холодильник уходит в конец: посреди ряда он разрывает столешницу.
   */
  function composeMain(run: Run): Slot[] {
    const wish: CatalogProduct[] = [bases.at(-1) ?? bases[0]!];
    if (dishwasher) wish.push(dishwasher);
    if (oven) wish.push(oven);

    const reserveMm = fridge ? fridge.widthMm : 0;
    const laid: Slot[] = [];
    let cursor = 0;

    // Место под холодильник держится в резерве, пока ряд набирается:
    // сам он этим резервом и является, поэтому себе его не прибавляет
    const put = (product: CatalogProduct, keepReserve = true): boolean => {
      const reserve = keepReserve ? reserveMm : 0;
      if (cursor + product.widthMm + reserve > run.lengthMm) return false;
      laid.push({ run, alongMm: cursor, widthMm: product.widthMm });
      assigned.set(laid.at(-1)!, product);
      cursor += product.widthMm;
      return true;
    };

    for (const product of wish) put(product);

    // Остаток ряда добирается обычными модулями
    for (let guard = 0; guard < 32; guard++) {
      const base = bases.find(
        (candidate) => cursor + candidate.widthMm + reserveMm <= run.lengthMm,
      );
      if (!base) break;
      put(base);
    }

    if (fridge && put(fridge, false)) tallSlots.add(laid.at(-1)!);

    return laid;
  }

  const assigned = new Map<Slot, CatalogProduct>();
  const tallSlots = new Set<Slot>();

  const slots = runs.map((run, index) =>
    index === 0 ? composeMain(run) : planSlots(run, bases),
  );
  const mainSlots = slots[0] ?? [];

  // Обычные места достаются нижним модулям
  for (const runSlots of slots) {
    for (const slot of runSlots) {
      if (assigned.has(slot)) continue;
      assigned.set(slot, bases.find((base) => base.widthMm <= slot.widthMm) ?? bases[0]!);
    }
  }

  const roleSlot = (role: CatalogProduct['role']): Slot | undefined =>
    mainSlots.find((slot) => assigned.get(slot)?.role === role);

  // Мойка над первым обычным модулем, плита — над духовкой
  const sinkSlot = mainSlots.find((slot) => assigned.get(slot)?.role === 'base');
  const hobSlot = roleSlot('oven') ?? mainSlots.filter((slot) => !tallSlots.has(slot)).at(-1);

  /**
   * Остаток ряда добирается последним свободным местом.
   *
   * Так и собирают кухню по месту — доборным модулем, а не щелью у
   * стены. Место под технику не тянется: у неё габарит стандартный.
   */
  for (const [index, runSlots] of slots.entries()) {
    const run = runs[index]!;
    const used = runSlots.reduce((sum, slot) => sum + slot.widthMm, 0);
    const remainder = run.lengthMm - used;
    if (remainder <= 0) continue;

    const last = [...runSlots]
      .reverse()
      .find((slot) => assigned.get(slot)?.role === 'base');
    if (!last) continue;

    last.widthMm += remainder;
    for (const slot of runSlots) {
      if (slot.alongMm > last.alongMm) slot.alongMm += remainder;
    }
  }

  for (const runSlots of slots) {
    for (const slot of runSlots) {
      const product = assigned.get(slot)!;
      const stretched =
        product.role === 'base' && slot.widthMm !== product.widthMm
          ? { widthMm: Math.round(slot.widthMm) }
          : {};

      add(
        product,
        slotCentre(slot, product.depthMm),
        facing(slot.run.normal),
        product.mountHeightMm,
        stretched,
      );
    }
  }

  /**
   * Непрерывные участки ряда без высокой техники.
   *
   * По ним кладётся столешница и вешаются верхние шкафы: и то и другое
   * упирается в холодильник, а не проходит сквозь него.
   */
  function freeSpans(runSlots: readonly Slot[], skip: ReadonlySet<Slot> = tallSlots): Slot[] {
    const spans: Slot[] = [];
    let current: Slot | null = null;

    for (const slot of runSlots) {
      if (skip.has(slot)) {
        current = null;
        continue;
      }
      if (!current) {
        current = { run: slot.run, alongMm: slot.alongMm, widthMm: slot.widthMm };
        spans.push(current);
        continue;
      }
      current.widthMm = slot.alongMm + slot.widthMm - current.alongMm;
    }

    return spans;
  }

  /**
   * Столешница кладётся сплошным куском на каждый участок: стык посреди
   * рабочей поверхности — это шов, куда затекает вода.
   */
  const worktop = worktops[0];
  if (!worktop) problems.push('В каталоге нет столешниц');

  if (worktop) {
    for (const runSlots of slots) {
      for (const span of freeSpans(runSlots)) {
        add(
          worktop,
          slotCentre(span, worktop.depthMm),
          facing(span.run.normal),
          worktop.mountHeightMm,
          { widthMm: Math.round(span.widthMm) },
        );
      }
    }
  }

  /**
   * Верхний ряд только над главной стеной: шкафы над каждой стеной
   * делают кухню коробкой без света.
   *
   * Место под вытяжку вырезается из ряда по её ШИРИНЕ, а не по ширине
   * плиты: вытяжка бывает шире, и шкаф рядом с ней иначе встаёт в неё.
   */
  const upperSpans =
    mainSlots.length === 0
      ? []
      : hood && hobSlot
        ? cutOut(
            freeSpans(mainSlots),
            hobSlot.alongMm + hobSlot.widthMm / 2 - hood.widthMm / 2,
            hobSlot.alongMm + hobSlot.widthMm / 2 + hood.widthMm / 2,
          )
        : freeSpans(mainSlots);

  if (walls.length > 0) {
    for (const span of upperSpans) {
      const sub: Run = {
        ...span.run,
        start: {
          x: span.run.start.x + span.run.along.x * span.alongMm,
          y: span.run.start.y + span.run.along.y * span.alongMm,
        },
        lengthMm: span.widthMm,
      };

      for (const slot of planSlots(sub, walls)) {
        const product = walls.find((item) => item.widthMm <= slot.widthMm) ?? walls[0]!;
        add(product, slotCentre(slot, product.depthMm), facing(sub.normal), product.mountHeightMm, {
          widthMm: Math.round(slot.widthMm),
        });
      }
    }
  }

  const surfaceMm = worktop
    ? worktop.mountHeightMm + (worktop.surfaceHeightMm ?? worktop.heightMm)
    : 858;

  if (sink && sinkSlot) {
    add(sink, slotCentre(sinkSlot, baseDepth), facing(sinkSlot.run.normal), surfaceMm);
  }
  if (hob && hobSlot) {
    add(hob, slotCentre(hobSlot, baseDepth), facing(hobSlot.run.normal), surfaceMm);
  }
  // Вытяжка строго над плитой: смещённая не тянет, и центр у них общий
  if (hood && hobSlot) {
    add(hood, slotCentre(hobSlot, baseDepth), facing(hobSlot.run.normal), hood.mountHeightMm);
  }

  return { placements, problems };
}
