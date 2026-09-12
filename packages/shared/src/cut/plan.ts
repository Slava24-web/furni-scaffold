import type { CatalogProduct, PanelSpec } from '../catalog/schema';
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
    for (const panel of product.panels) {
      parts.push({ ...panel, sku: product.sku, productName: product.name });
    }
  }
  return parts;
}

/** Ключ группы: свой лист на каждый материал и толщину. */
function groupKey(part: Pick<CutPart, 'material' | 'thicknessMm'>): string {
  return `${part.material}|${part.thicknessMm}`;
}

interface Shelf {
  yMm: number;
  heightMm: number;
  cursorXMm: number;
}

/**
 * Укладка деталей на листы полосами.
 *
 * Полосовой раскрой выбран не за плотность, а за то, что его можно
 * выполнить на форматно-раскроечном станке: рез идёт через весь лист
 * насквозь. Плотная упаковка «как получится» даёт красивую картинку,
 * которую невозможно распилить.
 *
 * Детали укладываются от высоких к низким — так в полосе меньше
 * пустого места над короткими деталями.
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
    const oriented = group
      .map((part) => orient(part, usableWidth, usableHeight))
      .sort((a, b) => b.heightMm - a.heightMm || b.widthMm - a.widthMm);

    let sheet = newSheet(group[0]!, sheets);
    let shelves: Shelf[] = [];
    let filledHeight = 0;

    const startSheet = (): void => {
      sheet = newSheet(group[0]!, sheets);
      shelves = [];
      filledHeight = 0;
    };

    for (const item of oriented) {
      const shelf = shelves.find(
        (candidate) =>
          item.heightMm <= candidate.heightMm &&
          candidate.cursorXMm + item.widthMm <= usableWidth,
      );

      if (shelf) {
        place(sheet, item, shelf.cursorXMm, shelf.yMm);
        shelf.cursorXMm += item.widthMm + options.kerfMm;
        continue;
      }

      const nextY = filledHeight === 0 ? 0 : filledHeight + options.kerfMm;
      if (nextY + item.heightMm > usableHeight) {
        finish(sheet, usableArea);
        sheets.push(sheet);
        startSheet();
      }

      const y = filledHeight === 0 ? 0 : filledHeight + options.kerfMm;
      shelves.push({
        yMm: y,
        heightMm: item.heightMm,
        cursorXMm: item.widthMm + options.kerfMm,
      });
      place(sheet, item, 0, y);
      filledHeight = y + item.heightMm;
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

/** Карта раскроя всей сцены. */
export function planCut(
  placements: readonly Placement[],
  products: ReadonlyMap<string, CatalogProduct>,
  options: CutOptions = DEFAULT_CUT,
): CutPlan {
  return packParts(sceneParts(placements, products), options);
}

/**
 * Разворот детали.
 *
 * Деталь с направленным рисунком не поворачивается: волокно фасада
 * обязано идти в одну сторону со всеми остальными, иначе кухня выглядит
 * собранной из обрезков. Остальные кладутся длинной стороной вдоль
 * листа — так полоса заполняется плотнее.
 */
function orient(part: CutPart, usableWidth: number, usableHeight: number): PlacedPart {
  const asIs = { widthMm: part.widthMm, heightMm: part.heightMm, rotated: false };
  const turned = { widthMm: part.heightMm, heightMm: part.widthMm, rotated: true };

  const fits = (item: typeof asIs): boolean =>
    item.widthMm <= usableWidth && item.heightMm <= usableHeight;

  const chosen = part.grain
    ? asIs
    : fits(asIs) && asIs.widthMm >= asIs.heightMm
      ? asIs
      : fits(turned)
        ? turned
        : asIs;

  return { part, xMm: 0, yMm: 0, ...chosen };
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
