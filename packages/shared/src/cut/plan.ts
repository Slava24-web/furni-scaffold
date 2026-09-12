import type { CatalogProduct, PanelSpec } from '../catalog/schema';
import { selectedFinish } from '../catalog/estimate';
import type { Placement } from '../scene/schema';

/**
 * Карта раскроя: из каких листов пилятся детали расставленной кухни.
 *
 * Расстановка в 3D и лист ЛДСП — две стороны одного заказа. Пока их
 * считают в разных программах, между ними всегда расхождение: в сцене
 * шкаф 800, а на распиле 796, и виноватого нет. Здесь детали берутся
 * из того же каталога, по которому собрана сцена.
 *
 * Чистая математика на миллиметрах: ни Three.js, ни DOM. Одна и та же
 * функция считает раскрой в браузере и на сервере.
 */

/** Ходовой формат ЛДСП. */
export const SHEET_WIDTH_MM = 2800;
export const SHEET_HEIGHT_MM = 2070;
/** Пропил: на него уходит материал между деталями. */
export const KERF_MM = 4;
/** Обрезка кромки листа: край плиты в дело не идёт. */
export const TRIM_MM = 10;

export interface CutOptions {
  sheetWidthMm: number;
  sheetHeightMm: number;
  kerfMm: number;
  trimMm: number;
}

export const DEFAULT_CUT: CutOptions = {
  sheetWidthMm: SHEET_WIDTH_MM,
  sheetHeightMm: SHEET_HEIGHT_MM,
  kerfMm: KERF_MM,
  trimMm: TRIM_MM,
};

/** Деталь конкретного изделия сцены. */
export interface CutPart extends PanelSpec {
  sku: string;
  productName: string;
}

/** Деталь, уложенная на лист. */
export interface PlacedPart {
  part: CutPart;
  xMm: number;
  yMm: number;
  /** Габарит НА ЛИСТЕ: у повёрнутой детали стороны меняются местами */
  widthMm: number;
  heightMm: number;
  rotated: boolean;
}

export interface SheetLayout {
  /** Порядковый номер листа в своей группе, с единицы */
  index: number;
  material: string;
  thicknessMm: number;
  parts: PlacedPart[];
  /** Доля площади листа, занятая деталями, 0..1 */
  usage: number;
}

export interface CutPlan {
  sheets: SheetLayout[];
  /** Детали, не помещающиеся на лист ни одной стороной */
  oversized: CutPart[];
  totalParts: number;
  /** Средняя загрузка листов, 0..1 */
  usage: number;
}

/**
 * Детали всех размещений сцены.
 *
 * Материал берётся с учётом выбранной отделки: у одного изделия корпус
 * из белого ЛДСП, а фасад — в том исполнении, которое заказали. Пилить
 * фасад из материала по умолчанию значит привезти не ту кухню.
 *
 * Товар без листовых деталей пропускается молча: техника и мойка на
 * распил не идут, и пустая строка в карте раскроя только мешает.
 */
export function sceneParts(
  placements: readonly Placement[],
  products: ReadonlyMap<string, CatalogProduct>,
): CutPart[] {
  const parts: CutPart[] = [];

  for (const placement of placements) {
    const product = products.get(placement.sku);
    if (!product) continue;

    // Слот отделки привязан к материалу модели: он же стоит и на детали
    const chosen = new Map<string, string>();
    for (const slot of product.finishes) {
      chosen.set(slot.slotMaterial, selectedFinish(slot.code, slot, placement.options));
    }

    for (const panel of product.panels) {
      parts.push({
        ...panel,
        material: chosen.get(panel.material) ?? panel.material,
        sku: product.sku,
        productName: product.name,
      });
    }
  }

  return parts;
}

/** Ключ группы: свой лист на каждый материал и толщину. */
function groupKey(part: Pick<CutPart, 'material' | 'thicknessMm'>): string {
  return `${part.material}|${part.thicknessMm}`;
}

/** Свободный прямоугольник листа. */
interface FreeRect {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

interface Fit {
  rect: FreeRect;
  widthMm: number;
  heightMm: number;
  rotated: boolean;
  /** Остаток площади: по нему выбирается лучший прямоугольник */
  wasteMm2: number;
  /** Остаток по узкой оси: главный признак хорошей посадки */
  shortSide: number;
}

/**
 * Укладка деталей гильотинным раскроем.
 *
 * Лист хранится списком свободных прямоугольников. Деталь кладётся в тот,
 * где после неё останется меньше всего площади, а остаток делится ровно
 * на два прямоугольника одним сквозным резом. Это и есть гильотина:
 * каждый рез идёт через всю заготовку насквозь, и раскрой можно
 * выполнить на форматно-раскроечном станке.
 *
 * Плотная упаковка «как получится» дала бы процентов на десять меньше
 * отхода и картинку, которую невозможно распилить.
 *
 * Порядок — от крупных деталей к мелким: крупная, положенная последней,
 * не влезает никуда и открывает лишний лист.
 */
export function packParts(parts: readonly CutPart[], options: CutOptions = DEFAULT_CUT): CutPlan {
  const usableWidth = options.sheetWidthMm - options.trimMm * 2;
  const usableHeight = options.sheetHeightMm - options.trimMm * 2;
  const usableArea = usableWidth * usableHeight;

  const oversized: CutPart[] = [];
  const groups = new Map<string, CutPart[]>();

  for (const part of parts) {
    if (!fitsAnyhow(part, usableWidth, usableHeight)) {
      oversized.push(part);
      continue;
    }
    const key = groupKey(part);
    const list = groups.get(key);
    if (list) list.push(part);
    else groups.set(key, [part]);
  }

  const sheets: SheetLayout[] = [];

  for (const group of groups.values()) {
    const queue = [...group].sort(
      (a, b) =>
        b.widthMm * b.heightMm - a.widthMm * a.heightMm ||
        Math.max(b.widthMm, b.heightMm) - Math.max(a.widthMm, a.heightMm),
    );

    let sheet = newSheet(group[0]!, sheets);
    let free: FreeRect[] = [{ xMm: 0, yMm: 0, widthMm: usableWidth, heightMm: usableHeight }];
    let pending = queue;

    while (pending.length > 0) {
      const rest: CutPart[] = [];
      let placedAny = false;

      for (const part of pending) {
        const fit = bestFit(part, free);
        if (!fit) {
          // Крупная деталь не влезла — это не повод закрывать лист:
          // мелкие ещё поместятся в оставшиеся куски
          rest.push(part);
          continue;
        }

        sheet.parts.push({
          part,
          xMm: fit.rect.xMm,
          yMm: fit.rect.yMm,
          widthMm: fit.widthMm,
          heightMm: fit.heightMm,
          rotated: fit.rotated,
        });
        free = split(free, fit, options.kerfMm);
        placedAny = true;
      }

      if (rest.length === 0) break;

      // За целый проход не легло ничего: лист исчерпан
      if (!placedAny) {
        finish(sheet, usableArea);
        sheets.push(sheet);
        sheet = newSheet(group[0]!, sheets);
        free = [{ xMm: 0, yMm: 0, widthMm: usableWidth, heightMm: usableHeight }];
      }
      pending = rest;
    }

    if (sheet.parts.length > 0) {
      finish(sheet, usableArea);
      sheets.push(sheet);
    }
  }

  const totalParts = parts.length - oversized.length;
  const usage =
    sheets.length === 0 ? 0 : sheets.reduce((sum, item) => sum + item.usage, 0) / sheets.length;

  return { sheets, oversized, totalParts, usage };
}

/**
 * Лучший свободный прямоугольник для детали.
 *
 * Берётся тот, где остаётся меньше площади: так крупные куски листа
 * остаются целыми и в них ещё можно что-то положить.
 */
function bestFit(part: CutPart, free: readonly FreeRect[]): Fit | null {
  let best: Fit | null = null;

  for (const rect of free) {
    for (const option of orientations(part)) {
      if (option.widthMm > rect.widthMm || option.heightMm > rect.heightMm) continue;

      // Лучшая посадка по короткой стороне: остаток по узкой оси
      // важнее площади — узкая полоска пропадает целиком, а широкий
      // остаток ещё примет деталь
      const leftoverX = rect.widthMm - option.widthMm;
      const leftoverY = rect.heightMm - option.heightMm;
      const shortSide = Math.min(leftoverX, leftoverY);
      const wasteMm2 = rect.widthMm * rect.heightMm - option.widthMm * option.heightMm;

      if (!best || shortSide < best.shortSide || (shortSide === best.shortSide && wasteMm2 < best.wasteMm2)) {
        best = { rect, ...option, wasteMm2, shortSide };
      }
    }
  }

  return best;
}

/**
 * Как можно положить деталь.
 *
 * Деталь с направленным рисунком не поворачивается: волокно фасада
 * обязано идти в одну сторону со всеми остальными, иначе кухня выглядит
 * собранной из обрезков.
 */
function orientations(part: CutPart): { widthMm: number; heightMm: number; rotated: boolean }[] {
  const direct = { widthMm: part.widthMm, heightMm: part.heightMm, rotated: false };
  if (part.grain || part.widthMm === part.heightMm) return [direct];
  return [direct, { widthMm: part.heightMm, heightMm: part.widthMm, rotated: true }];
}

/**
 * Деление свободного прямоугольника после укладки детали.
 *
 * Рез идёт по короткой стороне остатка: так более крупный из двух кусков
 * остаётся целым, а не режется на две узкие полосы. Пропил съедает
 * материал по обеим осям.
 */
function split(free: readonly FreeRect[], fit: Fit, kerfMm: number): FreeRect[] {
  const rest = free.filter((rect) => rect !== fit.rect);
  const { rect } = fit;

  const rightWidth = rect.widthMm - fit.widthMm - kerfMm;
  const bottomHeight = rect.heightMm - fit.heightMm - kerfMm;
  const horizontal = rightWidth <= bottomHeight;

  const right: FreeRect = {
    xMm: rect.xMm + fit.widthMm + kerfMm,
    yMm: rect.yMm,
    widthMm: rightWidth,
    heightMm: horizontal ? fit.heightMm : rect.heightMm,
  };
  const bottom: FreeRect = {
    xMm: rect.xMm,
    yMm: rect.yMm + fit.heightMm + kerfMm,
    widthMm: horizontal ? rect.widthMm : fit.widthMm,
    heightMm: bottomHeight,
  };

  for (const piece of [right, bottom]) {
    if (piece.widthMm > 0 && piece.heightMm > 0) rest.push(piece);
  }
  return rest;
}

/** Карта раскроя всей сцены. */
export function planCut(
  placements: readonly Placement[],
  products: ReadonlyMap<string, CatalogProduct>,
  options: CutOptions = DEFAULT_CUT,
): CutPlan {
  return packParts(sceneParts(placements, products), options);
}

function fitsAnyhow(part: CutPart, usableWidth: number, usableHeight: number): boolean {
  const direct = part.widthMm <= usableWidth && part.heightMm <= usableHeight;
  if (part.grain) return direct;
  return direct || (part.heightMm <= usableWidth && part.widthMm <= usableHeight);
}

function newSheet(sample: CutPart, sheets: readonly SheetLayout[]): SheetLayout {
  const sameGroup = sheets.filter(
    (sheet) => sheet.material === sample.material && sheet.thicknessMm === sample.thicknessMm,
  );
  return {
    index: sameGroup.length + 1,
    material: sample.material,
    thicknessMm: sample.thicknessMm,
    parts: [],
    usage: 0,
  };
}

function place(sheet: SheetLayout, item: PlacedPart, xMm: number, yMm: number): void {
  sheet.parts.push({ ...item, xMm, yMm });
}

function finish(sheet: SheetLayout, usableArea: number): void {
  const used = sheet.parts.reduce((sum, item) => sum + item.widthMm * item.heightMm, 0);
  sheet.usage = usableArea === 0 ? 0 : used / usableArea;
}
