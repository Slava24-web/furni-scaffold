import { buildKitchen, type KitchenLayoutKind, type KitchenResult } from './kitchenLayout';
import type { CatalogProduct } from '../catalog/schema';
import type { Room } from './schema';

/**
 * Готовые кухни: не раскладка, а проект.
 *
 * Раскладка отвечает на вопрос «в какую фигуру встают модули». Шаблон
 * отвечает на вопрос «какая это кухня»: белая скандинавская без ручек
 * на виду, тёмный лофт с наклонной вытяжкой, классика в дубе. Разница
 * между ними — отделка, набор техники и тип вытяжки, а не геометрия.
 *
 * Пустая сцена пугает: покупатель открывает планировщик и не знает,
 * с чего начать. Шаблон даёт готовую кухню за один тап, а дальше её
 * правят перетаскиванием.
 *
 * Шаблоны не называют артикулов: они описывают кухню ролями и кодами
 * отделки, поэтому работают в каталоге любого магазина. Чего нет —
 * пропускается, а не ломает сборку.
 */

export interface KitchenTemplate {
  id: string;
  name: string;
  /** Типаж одним словом: им карточки и различают */
  style: string;
  description: string;
  layout: KitchenLayoutKind;
  /** Отделка: код слота -> код материала. Слот, которого нет, игнорируется */
  finishes: Readonly<Record<string, string>>;
  /** Роли техники, которые входят в шаблон */
  appliances: readonly CatalogProduct['role'][];
  /**
   * Подсказка при выборе вытяжки: часть артикула или названия.
   * Не нашлось — берётся вытяжка по ширине плиты.
   */
  hood?: string;
  /** Образцы цвета для карточки: фасад и столешница, CSS-цвета */
  swatch: readonly [string, string];
}

/**
 * Техника, без которой кухня не кухня.
 *
 * Вытяжка здесь же: над плитой она обязательна по правилам эргономики,
 * и шаблон без неё собрал бы кухню, на которую сам же и пожалуется.
 */
const ESSENTIALS: readonly CatalogProduct['role'][] = ['sink', 'hob', 'fridge', 'hood'];

export const KITCHEN_TEMPLATES: readonly KitchenTemplate[] = [
  {
    id: 'nordic',
    name: 'Нордик',
    style: 'Скандинавский',
    description:
      'Белые фасады, светлая столешница, вытяжка спрятана в шкаф. Ряд вдоль одной стены — кухня не забирает комнату',
    layout: 'linear',
    finishes: { facade: 'white', worktop: 'white' },
    appliances: [...ESSENTIALS, 'dishwasher'],
    hood: 'BUILTIN',
    swatch: ['#eceae6', '#dcdad6'],
  },
  {
    id: 'oak-classic',
    name: 'Дубрава',
    style: 'Классика',
    description:
      'Дубовые филёнчатые фасады и каменная столешница. Угловая раскладка с духовкой и купольной вытяжкой',
    layout: 'corner',
    finishes: { facade: 'oak', worktop: 'stone' },
    appliances: [...ESSENTIALS, 'oven', 'dishwasher'],
    hood: 'DOME',
    swatch: ['#c9a227', '#6b6d70'],
  },
  {
    id: 'loft',
    name: 'Лофт',
    style: 'Индустриальный',
    description:
      'Графитовые фасады, тёмная столешница, наклонная вытяжка над плитой. Угловая кухня для тех, кто готовит',
    layout: 'corner',
    finishes: { facade: 'graphite', worktop: 'graphite' },
    appliances: [...ESSENTIALS, 'oven', 'dishwasher'],
    hood: 'SLANT',
    swatch: ['#31343a', '#22252a'],
  },
  {
    id: 'family',
    name: 'Семейная',
    style: 'Универсальный',
    description:
      'П-образная кухня с полным набором техники: духовка, посудомойка, большой холодильник. Нужна комната от 2.6 м',
    layout: 'u-shape',
    finishes: { facade: 'white', worktop: 'stone' },
    appliances: [...ESSENTIALS, 'oven', 'dishwasher'],
    hood: 'DOME',
    swatch: ['#eceae6', '#6b6d70'],
  },
  {
    id: 'compact',
    name: 'Компакт',
    style: 'Минимум',
    description:
      'Короткий ряд: мойка, плита, холодильник и ничего лишнего. Для маленькой кухни и для съёмной квартиры',
    layout: 'linear',
    finishes: { facade: 'oak', worktop: 'graphite' },
    appliances: ESSENTIALS,
    hood: 'BUILTIN',
    swatch: ['#c9a227', '#22252a'],
  },
];

export const kitchenTemplate = (id: string): KitchenTemplate | undefined =>
  KITCHEN_TEMPLATES.find((template) => template.id === id);

/**
 * Сборка кухни по шаблону.
 *
 * Отделка проставляется каждому размещению: изделие, у которого такого
 * слота нет, просто её не заметит — лишний ключ в options безвреден,
 * а проверять состав слотов здесь значило бы знать про каталог больше,
 * чем нужно.
 */
export function buildKitchenTemplate(
  template: KitchenTemplate,
  room: Room,
  products: readonly CatalogProduct[],
): KitchenResult {
  const result = buildKitchen(template.layout, room, products, {
    appliances: new Set(template.appliances),
    hoodHint: template.hood,
  });

  return {
    ...result,
    placements: result.placements.map((placement) => ({
      ...placement,
      options: { ...template.finishes, ...placement.options },
    })),
  };
}
