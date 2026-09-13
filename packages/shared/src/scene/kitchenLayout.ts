import { roomBounds } from './bounds';
import { SINK_LANDING_MAIN_MM } from '../rules/landing';
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
/** Что раскладка берёт из каталога тенанта. */
interface KitchenParts {
  bases: CatalogProduct[];
  walls: CatalogProduct[];
  worktop: CatalogProduct | undefined;
  fridge: CatalogProduct | undefined;
  dishwasher: CatalogProduct | undefined;
  oven: CatalogProduct | undefined;
  sink: CatalogProduct | undefined;
  hob: CatalogProduct | undefined;
  hood: CatalogProduct | undefined;
}

/** Чем раскладку можно ограничить: шаблон берёт не всю технику подряд. */
export interface KitchenOptions {
  /** Роли техники, которые разрешено ставить. Не задано — вся, что есть */
  appliances?: ReadonlySet<CatalogProduct['role']>;
  /** Часть артикула или названия предпочтительной вытяжки */
  hoodHint?: string | undefined;
}

/**
 * Подбор изделий под раскладку.
 *
 * Техника берётся самая узкая из ряда: стандартный фронт 600 влезает в
 * любую кухню, а Side-by-Side на 900 в маленькой съедает половину ряда.
 * Широкое пусть ставят руками.
 */
function selectParts(
  products: readonly CatalogProduct[],
  options: KitchenOptions = {},
): KitchenParts {
  const allowed = options.appliances;
  const wanted = (role: CatalogProduct['role']): boolean => !allowed || allowed.has(role);

  const narrowest = (role: CatalogProduct['role']): CatalogProduct | undefined =>
    wanted(role) ? pickByRole(products, role).at(-1) : undefined;

  const hob = narrowest('hob');
  return {
    bases: pickByRole(products, 'base'),
    walls: pickByRole(products, 'wall'),
    worktop: pickByRole(products, 'worktop')[0],
    fridge: narrowest('fridge'),
    dishwasher: narrowest('dishwasher'),
    oven: narrowest('oven'),
    sink: narrowest('sink'),
    hob,
    hood: hob && wanted('hood') ? pickHood(products, hob, options.hoodHint) : undefined,
  };
}

/**
 * Вытяжка под плиту.
 *
 * Шаблон может попросить конкретный тип — купольную, наклонную,
 * встраиваемую. Подсказка ищется в артикуле и названии: шаблоны не
 * знают артикулов конкретного магазина, и не нашлось — не беда.
 * По умолчанию берётся ближайшая по ширине: узкая над широкой плитой
 * не тянет.
 */
function pickHood(
  products: readonly CatalogProduct[],
  hob: CatalogProduct,
  hint: string | undefined,
): CatalogProduct | undefined {
  const hoods = pickByRole(products, 'hood');
  const byWidth = [...hoods].sort(
    (a, b) => Math.abs(a.widthMm - hob.widthMm) - Math.abs(b.widthMm - hob.widthMm),
  );
  if (!hint) return byWidth[0];

  const needle = hint.toLowerCase();
  const matches = byWidth.filter(
    (hood) =>
      hood.sku.toLowerCase().includes(needle) || hood.name.toLowerCase().includes(needle),
  );
  return matches[0] ?? byWidth[0];
}

/** Разложенные по местам изделия и то, что о них надо помнить дальше. */
interface RunPlan {
  /** Места по рядам, в порядке рядов */
  slots: Slot[][];
  mainSlots: Slot[];
  assigned: Map<Slot, CatalogProduct>;
  /** Места, занятые высокой техникой: столешница и верхний ряд их обходят */
  tallSlots: Set<Slot>;
  /** Под какими местами врезаны мойка и плита */
  sinkSlot: Slot | null;
  hobSlot: Slot | null;
}

/**
 * Порядок изделий в главном ряду.
 *
 * Угол ряда отдаётся обычным тумбам. Мойку и посудомойку в углу ставить
 * нельзя: рядом с мойкой нужна поверхность под мокрую посуду, а перед
 * открытой посудомойкой — место для человека (NKBA 11 и 13). Угловая
 * тумба — это норма, и она же даёт нужный отступ.
 *
 * Дальше мойка, сразу за ней посудомойка — их подключают к одному сливу.
 * Духовка отдельным местом, плита встаёт над ней. Холодильник уходит в
 * конец: посреди ряда он разрывает столешницу.
 */
function composeMainRun(
  run: Run,
  parts: KitchenParts,
  plan: RunPlan,
  cornerReserveMm: number,
): Slot[] {
  const { bases, dishwasher, oven, fridge } = parts;
  const widest = bases[0]!;
  const narrowest = bases.at(-1) ?? widest;

  const reserveMm = fridge ? fridge.widthMm : 0;
  const laid: Slot[] = [];
  let cursor = 0;

  // Место под холодильник держится в резерве, пока ряд набирается:
  // сам он этим резервом и является, поэтому себе его не прибавляет
  const put = (product: CatalogProduct, reserve = reserveMm): Slot | null => {
    if (cursor + product.widthMm + reserve > run.lengthMm) return null;

    const slot: Slot = { run, alongMm: cursor, widthMm: product.widthMm };
    laid.push(slot);
    plan.assigned.set(slot, product);
    cursor += product.widthMm;
    return slot;
  };

  // Угловая зона: тумбы, пока не наберётся отступ от угла. На короткий
  // ряд отступ не натягивается — тогда кухня соберётся с замечанием,
  // а не откажется собираться вовсе
  const guardMm = Math.min(
    cornerReserveMm + SINK_LANDING_MAIN_MM,
    Math.max(0, run.lengthMm - minimumWorkFrontMm(parts)),
  );
  for (let step = 0; step < 8 && cursor < guardMm; step++) {
    // Только то, что помещается В зону: тумба, вылезшая за неё, съедает
    // место у мойки, ради которого зона и заводилась
    const filler = bases.find((base) => cursor + base.widthMm <= guardMm);
    if (!filler || !put(filler)) break;
  }

  // Мойка: под неё нужна отдельная тумба, и она первая после угла
  plan.sinkSlot = parts.sink ? put(widest) : null;

  // Между мойкой и плитой нужна рабочая поверхность: ставить горячее
  // некуда, и брызги летят на конфорку. Обычно её занимает посудомойка,
  // а без неё — обычная тумба
  if (dishwasher) put(dishwasher);
  else if (plan.sinkSlot && parts.hob) put(narrowest);

  // Плита встаёт над духовкой; без духовки — над обычной тумбой.
  // Между ней и холодильником обязана остаться тумба: холодильник рядом
  // с источником тепла греется (NKBA и здравый смысл), а вытяжка шире
  // плиты и иначе въезжает в его колонну
  const cooking = oven ?? (parts.hob ? widest : null);
  const spacer = fridge && cooking ? narrowest : null;
  let cookingSlot: Slot | null = null;
  let fridgeFits = Boolean(fridge);

  if (cooking) {
    cookingSlot = put(cooking, reserveMm + (spacer?.widthMm ?? 0));
    if (cookingSlot && spacer) put(spacer);
    if (!cookingSlot) {
      // Ряд короткий: плита важнее холодильника, его поставят вручную
      cookingSlot = put(cooking, 0);
      fridgeFits = false;
    }
  }

  // Остаток ряда добирается обычными модулями
  const tailReserve = fridgeFits ? reserveMm : 0;
  for (let guard = 0; guard < 32; guard++) {
    const base = bases.find((candidate) => cursor + candidate.widthMm + tailReserve <= run.lengthMm);
    if (!base) break;
    put(base);
  }

  if (fridge && fridgeFits && put(fridge, 0)) plan.tallSlots.add(laid.at(-1)!);

  plan.hobSlot = parts.hob ? cookingSlot : null;
  // Если мойка не влезла после угла, она встаёт на первую тумбу: кухня
  // без мойки бессмысленна, а о тесноте скажет проверка эргономики
  if (parts.sink && !plan.sinkSlot) {
    plan.sinkSlot = laid.find((slot) => plan.assigned.get(slot)?.role === 'base') ?? null;
  }
  if (parts.hob && !plan.hobSlot) {
    plan.hobSlot = laid.filter((slot) => !plan.tallSlots.has(slot)).at(-1) ?? null;
  }

  return laid;
}

/**
 * Сколько ряда нужно оставить под рабочую зону.
 *
 * Отступ от угла не может съесть ряд целиком: если мойке, посудомойке и
 * плите после него уже не хватит места, отступ урезается.
 */
function minimumWorkFrontMm(parts: KitchenParts): number {
  const narrow = parts.bases.at(-1)?.widthMm ?? 600;
  const cooking = parts.oven?.widthMm ?? (parts.hob ? narrow : 0);
  // Между плитой и холодильником нужна тумба — она тоже часть фронта
  const spacer = parts.fridge && cooking > 0 ? narrow : 0;
  // Как и рабочая поверхность между мойкой и плитой
  const prep = parts.sink && parts.hob ? (parts.dishwasher?.widthMm ?? narrow) : 0;

  return (parts.sink ? narrow : 0) + prep + cooking + spacer + (parts.fridge?.widthMm ?? 0);
}

/**
 * Остаток ряда добирается последним свободным местом.
 *
 * Так и собирают кухню по месту — доборным модулем, а не щелью у стены.
 * Место под технику не тянется: у неё габарит стандартный.
 */
function absorbRemainder(runs: readonly Run[], plan: RunPlan): void {
  for (const [index, runSlots] of plan.slots.entries()) {
    const run = runs[index]!;
    const used = runSlots.reduce((sum, slot) => sum + slot.widthMm, 0);
    const remainder = run.lengthMm - used;
    if (remainder <= 0) continue;

    const last = [...runSlots].reverse().find((slot) => plan.assigned.get(slot)?.role === 'base');
    if (!last) continue;

    last.widthMm += remainder;
    for (const slot of runSlots) {
      if (slot.alongMm > last.alongMm) slot.alongMm += remainder;
    }
  }
}

/** Раскладка мест по рядам с уже назначенными изделиями. */
function planRuns(
  runs: readonly Run[],
  parts: KitchenParts,
  cornerReserveMm: number,
): RunPlan {
  const plan: RunPlan = {
    slots: [],
    mainSlots: [],
    assigned: new Map<Slot, CatalogProduct>(),
    tallSlots: new Set<Slot>(),
    sinkSlot: null,
    hobSlot: null,
  };

  plan.slots = runs.map((run, index) =>
    index === 0 ? composeMainRun(run, parts, plan, cornerReserveMm) : planSlots(run, parts.bases),
  );
  plan.mainSlots = plan.slots[0] ?? [];

  // Обычные места достаются нижним модулям
  for (const runSlots of plan.slots) {
    for (const slot of runSlots) {
      if (plan.assigned.has(slot)) continue;
      plan.assigned.set(
        slot,
        parts.bases.find((base) => base.widthMm <= slot.widthMm) ?? parts.bases[0]!,
      );
    }
  }

  absorbRemainder(runs, plan);
  return plan;
}

/**
 * Непрерывные участки ряда без высокой техники.
 *
 * По ним кладётся столешница и вешаются верхние шкафы: и то и другое
 * упирается в холодильник, а не проходит сквозь него.
 */
function freeSpans(runSlots: readonly Slot[], skip: ReadonlySet<Slot>): Slot[] {
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

/** Складывает готовые размещения: один способ создать Placement на всю раскладку. */
class Assembly {
  readonly placements: Placement[] = [];

  add(
    product: CatalogProduct,
    centre: Vec2,
    rotationDeg: number,
    yMm: number,
    size: Placement['size'] = {},
  ): void {
    this.placements.push({
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
  }
}

/** Нижний ряд: доборный модуль встаёт растянутым, техника — как есть. */
function placeModules(plan: RunPlan, into: Assembly): void {
  for (const runSlots of plan.slots) {
    for (const slot of runSlots) {
      const product = plan.assigned.get(slot)!;
      const stretched =
        product.role === 'base' && slot.widthMm !== product.widthMm
          ? { widthMm: Math.round(slot.widthMm) }
          : {};

      into.add(
        product,
        slotCentre(slot, product.depthMm),
        facing(slot.run.normal),
        product.mountHeightMm,
        stretched,
      );
    }
  }
}

/**
 * Столешница кладётся сплошным куском на каждый участок: стык посреди
 * рабочей поверхности — это шов, куда затекает вода.
 */
function placeWorktops(plan: RunPlan, worktop: CatalogProduct, into: Assembly): void {
  for (const runSlots of plan.slots) {
    for (const span of freeSpans(runSlots, plan.tallSlots)) {
      into.add(
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
 * Верхний ряд только над главной стеной: шкафы над каждой стеной делают
 * кухню коробкой без света.
 *
 * Место под вытяжку вырезается по ЕЁ ширине, а не по ширине плиты:
 * вытяжка бывает шире, и шкаф рядом с ней иначе встаёт в неё.
 */
function placeUpperRow(
  plan: RunPlan,
  walls: readonly CatalogProduct[],
  hood: CatalogProduct | undefined,
  hobSlot: Slot | undefined,
  into: Assembly,
): void {
  if (walls.length === 0 || plan.mainSlots.length === 0) return;

  const spans = freeSpans(plan.mainSlots, plan.tallSlots);
  const centred = hood && hobSlot ? hobSlot.alongMm + hobSlot.widthMm / 2 : null;
  const upper =
    centred === null || !hood
      ? spans
      : cutOut(spans, centred - hood.widthMm / 2, centred + hood.widthMm / 2);

  for (const span of upper) {
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
      into.add(product, slotCentre(slot, product.depthMm), facing(sub.normal), product.mountHeightMm, {
        widthMm: Math.round(slot.widthMm),
      });
    }
  }
}

/**
 * Помещается ли вытяжка над плитой, не задевая высокую технику.
 *
 * Вытяжка бывает шире плиты, а колонна холодильника идёт от пола
 * до потолка: над соседним местом ей уже не хватает.
 */
function hoodFits(hood: CatalogProduct, hobSlot: Slot, plan: RunPlan): boolean {
  const centre = hobSlot.alongMm + hobSlot.widthMm / 2;
  const from = centre - hood.widthMm / 2;
  const to = centre + hood.widthMm / 2;

  for (const slot of plan.tallSlots) {
    if (slot.run !== hobSlot.run) continue;
    if (from < slot.alongMm + slot.widthMm && to > slot.alongMm) return false;
  }
  return true;
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
  options: KitchenOptions = {},
): KitchenResult {
  const bounds = roomBounds([room]);
  const layout = KITCHEN_LAYOUTS.find((item) => item.kind === kind);
  if (!bounds || !layout) return { placements: [], problems: ['Нет помещения'] };

  const parts = selectParts(products, options);
  if (parts.bases.length === 0) {
    return { placements: [], problems: ['В каталоге нет нижних модулей'] };
  }

  const baseDepth = parts.bases[0]!.depthMm;
  // Соседний ряд отступает на глубину САМОГО глубокого изделия: холодильник
  // глубже модулей, и по глубине корпуса ряды сошлись бы углами
  const cornerDepth = Math.max(baseDepth, parts.fridge?.depthMm ?? 0);
  const runs = runsFor(kind, bounds, cornerDepth).filter((run) => run.lengthMm >= layout.minRunMm);
  if (runs.length === 0) {
    return { placements: [], problems: ['Помещение слишком мало для этой раскладки'] };
  }

  // Соседний ряд занимает начало главного: место под мойку и посудомойку
  // отсчитывается от его края, а не от стены
  const plan = planRuns(runs, parts, runs.length > 1 ? cornerDepth : 0);
  const assembly = new Assembly();
  const problems: string[] = [];

  const sinkSlot = plan.sinkSlot ?? undefined;
  const hobSlot = plan.hobSlot ?? undefined;

  placeModules(plan, assembly);
  if (parts.worktop) placeWorktops(plan, parts.worktop, assembly);
  else problems.push('В каталоге нет столешниц');
  placeUpperRow(plan, parts.walls, parts.hood, hobSlot, assembly);

  const surfaceMm = parts.worktop
    ? parts.worktop.mountHeightMm + (parts.worktop.surfaceHeightMm ?? parts.worktop.heightMm)
    : 858;

  if (parts.sink && sinkSlot) {
    assembly.add(parts.sink, slotCentre(sinkSlot, baseDepth), facing(sinkSlot.run.normal), surfaceMm);
  }
  if (parts.hob && hobSlot) {
    assembly.add(parts.hob, slotCentre(hobSlot, baseDepth), facing(hobSlot.run.normal), surfaceMm);
  }
  // Вытяжка строго над плитой: смещённая не тянет, и центр у них общий.
  // Если она при этом въезжает в колонну холодильника — не ставим вовсе:
  // сдвинуть её нельзя, а модель внутри модели хуже отсутствующей
  if (parts.hood && hobSlot) {
    if (hoodFits(parts.hood, hobSlot, plan)) {
      assembly.add(
        parts.hood,
        slotCentre(hobSlot, baseDepth),
        facing(hobSlot.run.normal),
        parts.hood.mountHeightMm,
      );
    } else {
      problems.push('Вытяжка не встала: рядом с плитой колонна');
    }
  }

  return { placements: assembly.placements, problems };
}
