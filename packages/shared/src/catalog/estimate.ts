import type { Placement } from '../scene/schema';
import type { CatalogMaterial, CatalogProduct } from './schema';

/**
 * Предварительная смета сцены.
 *
 * Считается на клиенте ради мгновенного отклика: пользователь меняет
 * отделку и сразу видит цену. В заявку эта цифра НЕ идёт — итог всегда
 * пересчитывает сервер по правилам тенанта (CLAUDE.md, правило 4).
 * Здесь нет ни скидок, ни правил конфигурации, ни наценок за монтаж.
 */

export interface EstimateLine {
  /** Ключ группировки: одинаковые изделия в одной отделке идут строкой */
  key: string;
  sku: string;
  name: string;
  /** Выбранная отделка: подпись слота -> название материала */
  finish: { label: string; material: string }[];
  quantity: number;
  unitCents: number;
  totalCents: number;
}

export interface SceneEstimate {
  lines: EstimateLine[];
  positions: number;
  totalCents: number;
  /** SKU, которых нет в каталоге: их цена неизвестна */
  unknownSkus: string[];
}

/**
 * Надбавка за выбранную отделку относительно исполнения по умолчанию.
 *
 * Считается разницей, а не абсолютной ценой материала: базовая цена
 * изделия уже включает материал, который стоит в модели.
 */
export function finishDeltaCents(
  product: CatalogProduct,
  options: Placement['options'],
  materials: ReadonlyMap<string, CatalogMaterial>,
): number {
  let delta = 0;

  for (const slot of product.finishes) {
    const chosen = options[slot.code];
    if (!chosen || chosen === slot.slotMaterial) continue;
    if (!slot.options.includes(chosen)) continue;

    const selected = materials.get(chosen)?.priceModifierCents ?? 0;
    const included = materials.get(slot.slotMaterial)?.priceModifierCents ?? 0;
    delta += selected - included;
  }

  return delta;
}

export function placementPriceCents(
  product: CatalogProduct,
  options: Placement['options'],
  materials: ReadonlyMap<string, CatalogMaterial>,
): number {
  return product.basePriceCents + finishDeltaCents(product, options, materials);
}

/**
 * Смета по всей сцене.
 *
 * Строки группируются по изделию И отделке: два одинаковых шкафа
 * в разных фасадах стоят по-разному, и сливать их в одну строку значит
 * показывать неверную цену за единицу.
 */
export function estimateScene(
  placements: readonly Placement[],
  products: ReadonlyMap<string, CatalogProduct>,
  materials: ReadonlyMap<string, CatalogMaterial>,
): SceneEstimate {
  const lines = new Map<string, EstimateLine>();
  const unknown = new Set<string>();

  for (const placement of placements) {
    const product = products.get(placement.sku);
    if (!product) {
      unknown.add(placement.sku);
      continue;
    }

    const finish = describeFinish(product, placement.options, materials);
    const key = `${placement.sku}|${finish.map((part) => part.material).join(',')}`;
    const unitCents = placementPriceCents(product, placement.options, materials);

    const line = lines.get(key);
    if (line) {
      line.quantity += 1;
      line.totalCents += unitCents;
      continue;
    }

    lines.set(key, {
      key,
      sku: placement.sku,
      name: product.name,
      finish,
      quantity: 1,
      unitCents,
      totalCents: unitCents,
    });
  }

  const ordered = [...lines.values()].sort((a, b) => b.totalCents - a.totalCents);
  return {
    lines: ordered,
    positions: placements.length,
    totalCents: ordered.reduce((sum, line) => sum + line.totalCents, 0),
    unknownSkus: [...unknown],
  };
}

/** Человекочитаемое описание выбранной отделки. */
function describeFinish(
  product: CatalogProduct,
  options: Placement['options'],
  materials: ReadonlyMap<string, CatalogMaterial>,
): { label: string; material: string }[] {
  return product.finishes.map((slot) => {
    const code = selectedFinish(slot.code, slot, options);
    return { label: slot.label, material: materials.get(code)?.name ?? code };
  });
}

/** Выбранный материал слота или исполнение по умолчанию. */
export function selectedFinish(
  slotCode: string,
  slot: { slotMaterial: string; options: readonly string[] },
  options: Placement['options'],
): string {
  const chosen = options[slotCode];
  return chosen && slot.options.includes(chosen) ? chosen : slot.slotMaterial;
}
