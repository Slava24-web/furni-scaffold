import type { CatalogProduct, PanelSpec } from '../catalog/schema';
import type { Placement } from '../scene/schema';
import type { CutPart } from './plan';

/**
 * Кромка и фурнитура к заказу.
 *
 * Раскрой без кромки и петель — половина заказа: плиту привезут, а
 * собрать из неё будет нечего. Считается по тем же деталям, что уходят
 * в распил, поэтому список не может разойтись с картой.
 */

export interface EdgeBandingLine {
  thicknessMm: number;
  /** Погонные метры с запасом на обрезку */
  metres: number;
}

export interface HardwareLine {
  name: string;
  quantity: number;
  unit: string;
}

/** Запас кромки на обрезку и брак: реальный расход всегда больше расчётного. */
export const EDGE_WASTE = 1.1;

/**
 * Погонаж кромки по толщинам.
 *
 * Толщины не смешиваются: двойка на фасаде и четырёхдесятка на корпусе
 * это два разных материала и две разные цены.
 */
export function edgeBanding(parts: readonly CutPart[]): EdgeBandingLine[] {
  const totals = new Map<number, number>();

  for (const part of parts) {
    if (part.edgeLengthMm <= 0 || part.edgeThicknessMm <= 0) continue;
    totals.set(part.edgeThicknessMm, (totals.get(part.edgeThicknessMm) ?? 0) + part.edgeLengthMm);
  }

  return [...totals]
    .map(([thicknessMm, lengthMm]) => ({
      thicknessMm,
      metres: Math.ceil(((lengthMm / 1000) * EDGE_WASTE) * 10) / 10,
    }))
    .sort((a, b) => b.thicknessMm - a.thicknessMm);
}

/** Петли на распашной фасад: на высокий их ставят больше. */
function hingesFor(panel: PanelSpec): number {
  const height = Math.max(panel.widthMm, panel.heightMm);
  if (height > 1600) return 4;
  if (height > 900) return 3;
  return 2;
}

/**
 * Фурнитура по расставленным изделиям.
 *
 * Считается по составу изделия, а не по прайсу: петли нужны каждому
 * распашному фасаду независимо от того, продаёт их магазин отдельной
 * позицией или нет.
 */
export function hardwareList(
  placements: readonly Placement[],
  products: ReadonlyMap<string, CatalogProduct>,
): HardwareLine[] {
  let hinges = 0;
  let slides = 0;
  let handles = 0;
  let shelfPins = 0;

  for (const placement of placements) {
    const product = products.get(placement.sku);
    if (!product) continue;

    const facades = product.panels.filter((panel) => panel.kind === 'facade');
    const shelves = product.panels.filter((panel) => panel.kind === 'shelf');

    // Фронт ящика — тоже фасад, но на петлях он не висит
    const swinging = Math.max(0, facades.length - product.drawerCount);
    for (const panel of facades.slice(0, swinging)) hinges += hingesFor(panel);

    slides += product.drawerCount;
    handles += facades.length;
    // Полкодержатели: по четыре на полку
    shelfPins += shelves.length * 4;
  }

  return [
    { name: 'Петли накладные', quantity: hinges, unit: 'шт' },
    { name: 'Направляющие для ящиков', quantity: slides, unit: 'компл' },
    { name: 'Ручки', quantity: handles, unit: 'шт' },
    { name: 'Полкодержатели', quantity: shelfPins, unit: 'шт' },
  ].filter((line) => line.quantity > 0);
}
