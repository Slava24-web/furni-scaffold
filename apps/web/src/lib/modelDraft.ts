import type { CatalogProduct } from '@furni/shared';

/**
 * Черновик карточки каталога.
 *
 * Отделён от готового товара: пока модель принимают, часть полей пуста
 * или неверна, и гнать её через Zod-схему на каждый ввод значило бы
 * спорить с пользователем на каждой букве. Схема применяется один раз,
 * когда карточку выпускают.
 */
export interface ModelDraft {
  sku: string;
  name: string;
  category: string;
  priceRubles: number;
  role: CatalogProduct['role'];
  mountHeightMm: number;
  snapToWall: boolean;
  stackable: boolean;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  materials: readonly string[];
}

export const blankDraft = (): ModelDraft => ({
  sku: '',
  name: '',
  category: '',
  priceRubles: 0,
  role: 'furniture',
  mountHeightMm: 0,
  snapToWall: true,
  stackable: false,
  widthMm: 0,
  heightMm: 0,
  depthMm: 0,
  materials: [],
});

/** Обмер модели: ровно то, что нужно карточке. */
export interface InspectedModelLike {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  materials: readonly string[];
}

/**
 * Артикул из названия, когда магазин его не задал.
 *
 * Латиницей и в верхнем регистре: артикул попадает в имена файлов
 * и в URL моделей, а кириллица там превращается в проценты.
 */
const TRANSLIT: Record<string, string> = {
  а: 'A', б: 'B', в: 'V', г: 'G', д: 'D', е: 'E', ё: 'E', ж: 'ZH', з: 'Z',
  и: 'I', й: 'Y', к: 'K', л: 'L', м: 'M', н: 'N', о: 'O', п: 'P', р: 'R',
  с: 'S', т: 'T', у: 'U', ф: 'F', х: 'H', ц: 'C', ч: 'CH', ш: 'SH', щ: 'SCH',
  ъ: '', ы: 'Y', ь: '', э: 'E', ю: 'YU', я: 'YA',
};

export function skuFrom(name: string): string {
  const latin = [...name.toLowerCase()]
    .map((letter) => TRANSLIT[letter] ?? letter)
    .join('')
    .toUpperCase();

  return latin
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Готовая карточка каталога из черновика и обмера модели. */
export function productFromDraft(
  draft: ModelDraft,
  facts: InspectedModelLike,
): Record<string, unknown> {
  return {
    sku: draft.sku.trim() || skuFrom(draft.name),
    name: draft.name.trim(),
    category: draft.category.trim() || 'Без категории',
    type: 'static',
    role: draft.role,
    // Цена хранится в копейках: дробные рубли на клиенте округляются
    // по-разному в разных браузерах, и сумма сметы не сходится
    basePriceCents: Math.round(draft.priceRubles * 100),
    widthMm: facts.widthMm,
    heightMm: facts.heightMm,
    depthMm: facts.depthMm,
    mountHeightMm: Math.round(draft.mountHeightMm),
    snapToWall: draft.snapToWall,
    stackable: draft.stackable,
    materials: [...facts.materials],
  };
}
