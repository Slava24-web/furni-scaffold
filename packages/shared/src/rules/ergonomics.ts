import { boxAxes, type Box } from '../scene/box';
import type { CatalogProduct } from '../catalog/schema';
import type { Placement, Room } from '../scene/schema';
import { roundMm, severityRank, type ErgonomicFinding } from './finding';
import { checkLanding } from './landing';
import { FRONTED, distanceMm, kitchenItems, pickRole, type KitchenItem } from './items';

export type { ErgonomicFinding, FindingSeverity } from './finding';
export * from './landing';

/**
 * Правила эргономики кухни.
 *
 * Планировщик, который молчит о неудобной кухне, продаёт неудобную
 * кухню. Мебель может не пересекаться ни с чем и всё равно стоять так,
 * что готовить невозможно: мойка вплотную к плите, холодильник у духовки,
 * проход между рядами в полметра.
 *
 * Правила — подсказки, а не запреты. Заказчик вправе поставить по-своему:
 * бывают комнаты, где иначе не получается, и заблокированная расстановка
 * ощущается как поломка.
 *
 * Здесь живут правила об отношениях изделий друг к другу; правила
 * о рабочей поверхности вокруг изделия — в landing.ts.
 *
 * Числа взяты из NKBA Kitchen Planning Guidelines и практики кухонных
 * салонов: рабочий треугольник 3.6–6.6 м (NKBA допускает до 7.9 м
 * по сумме), разрыв между мойкой и плитой от 400 мм, проход между
 * фронтами от 900 мм (NKBA — 1070 мм на одного готовящего).
 */

/** Минимальная рабочая поверхность между мойкой и плитой. */
export const MIN_SINK_HOB_MM = 400;
/** Комфортный разрыв там же. */
export const GOOD_SINK_HOB_MM = 600;
/** Минимальный проход между фронтами двух рядов. */
export const MIN_AISLE_MM = 900;
/** Комфортный проход: двое разойдутся. */
export const GOOD_AISLE_MM = 1200;
/** Холодильник рядом с плитой греется. */
export const MIN_FRIDGE_HOB_MM = 400;
/** Шланг посудомойки тянут к мойке. */
export const MAX_DISHWASHER_SINK_MM = 1500;
/** Рабочий треугольник: сумма сторон. */
export const MIN_TRIANGLE_MM = 3600;
export const MAX_TRIANGLE_MM = 6600;
/** Вытяжка должна стоять над плитой. */
export const MAX_HOOD_OFFSET_MM = 200;


/**
 * Проверка расстановки.
 *
 * Возвращает список замечаний в порядке важности: предупреждения раньше
 * заметок. Пустой список означает «претензий нет», а не «проверка не
 * работает» — поэтому правила молчат только тогда, когда им нечего
 * сказать.
 */
export function checkErgonomics(
  placements: readonly Placement[],
  products: ReadonlyMap<string, CatalogProduct>,
  rooms: readonly Room[] = [],
): ErgonomicFinding[] {
  const items = kitchenItems(placements, products);

  const findings: ErgonomicFinding[] = [
    ...triangle(items),
    ...sinkAndHob(items),
    ...fridgeAndHob(items),
    ...hoodOverHob(items),
    ...dishwasherNearSink(items),
    ...aisles(items),
    // Рабочие зоны считаются от комнаты: угол образует и стена, и ряд
    ...checkLanding(items, rooms),
  ];

  return findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

/**
 * Рабочий треугольник мойка — плита — холодильник.
 *
 * Самое известное правило кухни и единственное, которое проверяет
 * расстановку целиком, а не пару соседей.
 */
function triangle(items: readonly KitchenItem[]): ErgonomicFinding[] {
  const sink = pickRole(items, 'sink')[0];
  const hob = pickRole(items, 'hob')[0];
  const fridge = pickRole(items, 'fridge')[0];
  if (!sink || !hob || !fridge) return [];

  const legs =
    distanceMm(sink.centre, hob.centre) +
    distanceMm(hob.centre, fridge.centre) +
    distanceMm(fridge.centre, sink.centre);
  const ids = [sink.instanceId, hob.instanceId, fridge.instanceId];

  if (legs < MIN_TRIANGLE_MM) {
    return [
      {
        code: 'triangle-tight',
        severity: 'note',
        message: `Рабочий треугольник ${roundMm(legs)} мм — тесно. Мойке, плите и холодильнику нужно от ${MIN_TRIANGLE_MM} мм по сумме сторон`,
        instanceIds: ids,
      },
    ];
  }

  if (legs > MAX_TRIANGLE_MM) {
    return [
      {
        code: 'triangle-wide',
        severity: 'note',
        message: `Рабочий треугольник ${roundMm(legs)} мм — далеко ходить. Комфортный предел ${MAX_TRIANGLE_MM} мм`,
        instanceIds: ids,
      },
    ];
  }

  return [];
}

/** Между мойкой и плитой нужна рабочая поверхность. */
function sinkAndHob(items: readonly KitchenItem[]): ErgonomicFinding[] {
  const findings: ErgonomicFinding[] = [];

  for (const sink of pickRole(items, 'sink')) {
    for (const hob of pickRole(items, 'hob')) {
      const gap = gapBetween(sink.box, hob.box);
      const ids = [sink.instanceId, hob.instanceId];

      if (gap < MIN_SINK_HOB_MM) {
        findings.push({
          code: 'sink-hob-close',
          severity: 'warning',
          message: `Между мойкой и плитой ${roundMm(gap)} мм. Нужна рабочая поверхность от ${MIN_SINK_HOB_MM} мм: ставить горячее некуда, и брызги летят на плиту`,
          instanceIds: ids,
        });
      } else if (gap < GOOD_SINK_HOB_MM) {
        findings.push({
          code: 'sink-hob-tight',
          severity: 'note',
          message: `Между мойкой и плитой ${roundMm(gap)} мм. Удобно от ${GOOD_SINK_HOB_MM} мм`,
          instanceIds: ids,
        });
      }
    }
  }

  return findings;
}

/** Холодильник рядом с плитой греется и тратит больше. */
function fridgeAndHob(items: readonly KitchenItem[]): ErgonomicFinding[] {
  const findings: ErgonomicFinding[] = [];

  for (const fridge of pickRole(items, 'fridge')) {
    for (const hob of [...pickRole(items, 'hob'), ...pickRole(items, 'oven')]) {
      const gap = gapBetween(fridge.box, hob.box);
      if (gap >= MIN_FRIDGE_HOB_MM) continue;

      findings.push({
        code: 'fridge-heat',
        severity: 'warning',
        message: `Холодильник в ${roundMm(gap)} мм от источника тепла. Нужно от ${MIN_FRIDGE_HOB_MM} мм, иначе он греется и работает вхолостую`,
        instanceIds: [fridge.instanceId, hob.instanceId],
      });
    }
  }

  return findings;
}

/** Вытяжка обязана стоять над плитой. */
function hoodOverHob(items: readonly KitchenItem[]): ErgonomicFinding[] {
  const hobs = pickRole(items, 'hob');
  const hoods = pickRole(items, 'hood');
  if (hobs.length === 0) return [];

  if (hoods.length === 0) {
    return [
      {
        code: 'hood-missing',
        severity: 'note',
        message: 'Над плитой нет вытяжки',
        instanceIds: hobs.map((hob) => hob.instanceId),
      },
    ];
  }

  const findings: ErgonomicFinding[] = [];
  for (const hood of hoods) {
    const nearest = hobs
      .map((hob) => ({ hob, offset: distanceMm(hood.centre, hob.centre) }))
      .sort((a, b) => a.offset - b.offset)[0]!;

    if (nearest.offset > MAX_HOOD_OFFSET_MM) {
      findings.push({
        code: 'hood-offset',
        severity: 'warning',
        message: `Вытяжка смещена от плиты на ${roundMm(nearest.offset)} мм. Она обязана стоять над ней, иначе не тянет`,
        instanceIds: [hood.instanceId, nearest.hob.instanceId],
      });
    }
  }

  return findings;
}

/** Посудомойку подключают к мойке: длинный шланг — это протечка. */
function dishwasherNearSink(items: readonly KitchenItem[]): ErgonomicFinding[] {
  const sinks = pickRole(items, 'sink');
  if (sinks.length === 0) return [];

  const findings: ErgonomicFinding[] = [];
  for (const dishwasher of pickRole(items, 'dishwasher')) {
    const nearest = Math.min(...sinks.map((sink) => distanceMm(dishwasher.centre, sink.centre)));
    if (nearest <= MAX_DISHWASHER_SINK_MM) continue;

    findings.push({
      code: 'dishwasher-far',
      severity: 'note',
      message: `Посудомойка в ${roundMm(nearest)} мм от мойки. Её подключают к тому же сливу — дальше ${MAX_DISHWASHER_SINK_MM} мм тянуть неудобно`,
      instanceIds: [dishwasher.instanceId, ...sinks.map((sink) => sink.instanceId)],
    });
  }

  return findings;
}

/**
 * Проход между рядами.
 *
 * Считается между фронтами двух объектов, повёрнутых друг к другу:
 * именно там открывают дверцы и расходятся вдвоём. Ряды, стоящие
 * спиной к спине или в одну линию, друг другу не мешают.
 */
function aisles(items: readonly KitchenItem[]): ErgonomicFinding[] {
  const fronted = items.filter((item) => FRONTED.has(item.role));
  const findings: ErgonomicFinding[] = [];
  let worst: { gap: number; ids: string[] } | null = null;

  for (let i = 0; i < fronted.length; i++) {
    for (let j = i + 1; j < fronted.length; j++) {
      const a = fronted[i]!;
      const b = fronted[j]!;

      const forwardA = boxAxes(a.box).forward;
      const forwardB = boxAxes(b.box).forward;
      // Смотрят навстречу: скалярное произведение направлений близко к −1
      if (forwardA.x * forwardB.x + forwardA.y * forwardB.y > -0.7) continue;

      const between = { x: b.centre.x - a.centre.x, y: b.centre.y - a.centre.y };
      const along = between.x * forwardA.x + between.y * forwardA.y;
      if (along <= 0) continue; // стоят спиной друг к другу

      // Боковое смещение: ряды, разъехавшиеся вбок, проходу не мешают
      const side = Math.abs(between.x * forwardA.y - between.y * forwardA.x);
      if (side > a.box.halfWidthMm + b.box.halfWidthMm) continue;

      const gap = along - a.box.halfDepthMm - b.box.halfDepthMm;
      if (gap <= 0 || gap >= GOOD_AISLE_MM) continue;
      if (!worst || gap < worst.gap) worst = { gap, ids: [a.instanceId, b.instanceId] };
    }
  }

  if (!worst) return findings;

  findings.push(
    worst.gap < MIN_AISLE_MM
      ? {
          code: 'aisle-narrow',
          severity: 'warning',
          message: `Проход между рядами ${roundMm(worst.gap)} мм. Нужно от ${MIN_AISLE_MM} мм, иначе не открыть дверцы`,
          instanceIds: worst.ids,
        }
      : {
          code: 'aisle-tight',
          severity: 'note',
          message: `Проход между рядами ${roundMm(worst.gap)} мм. Вдвоём разойтись от ${GOOD_AISLE_MM} мм`,
          instanceIds: worst.ids,
        },
  );

  return findings;
}

/**
 * Зазор между габаритами в плане.
 *
 * Считается по осям мира, а не по нормалям: правила говорят о расстоянии
 * между вещами, а не о том, под каким углом они повёрнуты.
 */
function gapBetween(a: Box, b: Box): number {
  const dx = Math.abs(a.centre.x - b.centre.x) - (a.halfWidthMm + b.halfWidthMm);
  const dz = Math.abs(a.centre.y - b.centre.y) - (a.halfDepthMm + b.halfDepthMm);
  return Math.max(0, Math.max(dx, dz));
}
