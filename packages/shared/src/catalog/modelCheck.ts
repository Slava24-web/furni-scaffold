import { ASSET_BUDGETS } from '../budgets';

/**
 * Приёмка модели, загруженной магазином.
 *
 * Модель, собранная в чужом редакторе, почти никогда не готова к сцене:
 * начало координат в центре габарита вместо низа, метры перепутаны
 * с сантиметрами, полмиллиона треугольников на дверную ручку. Всё это
 * всплывает не при загрузке, а через неделю — когда шкаф провалился
 * в пол на витрине магазина.
 *
 * Проверка идёт на границе, до сохранения, и говорит не «файл неверный»,
 * а что именно поправить. Числа — из ASSET_BUDGETS и конвенций проекта
 * (CLAUDE.md): миллиметры целыми, ось Y вверх, origin — низ-центр.
 */

/** Что удалось вычитать из файла модели. */
export interface ModelFacts {
  /** Габарит по вершинам, миллиметры */
  widthMm: number;
  heightMm: number;
  depthMm: number;
  /** Низ габарита относительно origin, мм. Ноль — модель стоит на полу */
  minYMm: number;
  /** Центр габарита в плане относительно origin, мм */
  centreXMm: number;
  centreZMm: number;
  triangles: number;
  /** Имена материалов модели: по ним подключается отделка */
  materials: readonly string[];
  /** Наибольшая сторона текстуры, пиксели. Ноль — текстур нет */
  maxTextureSize: number;
  /** Имена узлов: по ним находятся подвижные детали */
  nodeNames: readonly string[];
}

export type ModelIssueLevel = 'error' | 'warning' | 'note';

export interface ModelIssue {
  code: string;
  level: ModelIssueLevel;
  message: string;
  /** Что сделать. Пусто, если очевидно из сообщения */
  fix?: string;
}

/** Допуск на положение origin: экспортёры округляют вершины. */
const ORIGIN_TOLERANCE_MM = 2;
/**
 * Насколько габаритная коробка может съехать в плане и это будет нормой.
 *
 * У изделия с ручкой или свесом столешницы центр КОРОБКИ не совпадает
 * с центром корпуса: ручка торчит вперёд на несколько сантиметров.
 * Корпус при этом отцентрирован правильно, и двигать модель нельзя —
 * иначе её спинка отойдёт от стены при примагничивании.
 */
const PROTRUSION_SHARE = 0.08;
/** Ниже этого габарита модель почти наверняка приехала в метрах. */
const SUSPICIOUS_SIZE_MM = 50;
/** Выше этого — в модели перепутаны единицы в обратную сторону. */
const HUGE_SIZE_MM = 6000;

export function checkModel(facts: ModelFacts): ModelIssue[] {
  return [
    ...checkUnits(facts),
    ...checkOrigin(facts),
    ...checkWeight(facts),
    ...checkMaterials(facts),
  ];
}

/** Ничего не мешает публикации: ошибок нет, предупреждения допустимы. */
export const modelPublishable = (issues: readonly ModelIssue[]): boolean =>
  issues.every((issue) => issue.level !== 'error');

/**
 * Единицы.
 *
 * glTF хранит метры, каталог — миллиметры целыми. Шкаф в 2.2 единицы
 * может быть и 2.2 метра, и 2.2 миллиметра; отличить их можно только
 * по здравому смыслу о размере мебели.
 */
function checkUnits(facts: ModelFacts): ModelIssue[] {
  const largest = Math.max(facts.widthMm, facts.heightMm, facts.depthMm);

  if (largest < SUSPICIOUS_SIZE_MM) {
    return [
      {
        code: 'units-tiny',
        level: 'error',
        message: `Самая большая сторона ${Math.round(largest)} мм — это меньше спичечного коробка`,
        fix: 'Похоже, модель экспортирована в сантиметрах или дюймах. Пересчитайте в метры: glTF хранит метры, каталог — миллиметры',
      },
    ];
  }

  if (largest > HUGE_SIZE_MM) {
    return [
      {
        code: 'units-huge',
        level: 'warning',
        message: `Самая большая сторона ${Math.round(largest)} мм — это больше любого кухонного модуля`,
        fix: 'Проверьте масштаб экспорта. Если изделие действительно такое, предупреждение можно не учитывать',
      },
    ];
  }

  return [];
}

/**
 * Начало координат.
 *
 * Origin — низ-центр габарита (CLAUDE.md). Модель с origin в центре
 * наполовину уходит в пол, а со смещённым в плане — разъезжается
 * при стыковке с соседним модулем.
 */
function checkOrigin(facts: ModelFacts): ModelIssue[] {
  const issues: ModelIssue[] = [];

  if (Math.abs(facts.minYMm) > ORIGIN_TOLERANCE_MM) {
    const half = Math.abs(facts.minYMm + facts.heightMm / 2) <= ORIGIN_TOLERANCE_MM;
    issues.push({
      code: 'origin-height',
      level: 'error',
      message:
        facts.minYMm < 0
          ? `Низ модели на ${Math.round(-facts.minYMm)} мм ниже начала координат: в сцене она утонет в полу`
          : `Низ модели на ${Math.round(facts.minYMm)} мм выше начала координат: в сцене она повиснет над полом`,
      fix: half
        ? 'Начало координат в центре габарита. Опустите модель так, чтобы её низ лёг на ноль'
        : 'Сдвиньте модель так, чтобы низ габарита лёг на ноль по оси Y',
    });
  }

  const offX = Math.abs(facts.centreXMm);
  const offZ = Math.abs(facts.centreZMm);
  const offPlan = Math.max(offX, offZ);

  if (offPlan > ORIGIN_TOLERANCE_MM) {
    // Смещение меряется долей от стороны: 29 мм у шкафа в 618 — это
    // торчащая ручка, 290 мм — это забытый центр
    const share = Math.max(
      facts.widthMm > 0 ? offX / facts.widthMm : 0,
      facts.depthMm > 0 ? offZ / facts.depthMm : 0,
    );

    issues.push(
      share <= PROTRUSION_SHARE
        ? {
            code: 'origin-protrusion',
            level: 'warning',
            message: `Центр габарита смещён на ${Math.round(offPlan)} мм: похоже на торчащую ручку или свес`,
            fix: 'Если корпус отцентрирован, это нормально: двигать модель не нужно, иначе её спинка отойдёт от стены',
          }
        : {
            code: 'origin-plan',
            level: 'error',
            message: `Центр габарита смещён от начала координат на ${Math.round(offPlan)} мм`,
            fix: 'Отцентрируйте модель по осям X и Z: по центру габарита считаются стыковка и поворот',
          },
    );
  }

  return issues;
}

/** Вес геометрии: бюджет жёсткий, и превышение не публикуется. */
function checkWeight(facts: ModelFacts): ModelIssue[] {
  const issues: ModelIssue[] = [];

  if (facts.triangles > ASSET_BUDGETS.lod0MaxTriangles) {
    issues.push({
      code: 'triangles',
      level: 'error',
      message: `${facts.triangles.toLocaleString('ru-RU')} треугольников при бюджете ${ASSET_BUDGETS.lod0MaxTriangles.toLocaleString('ru-RU')}`,
      fix: 'Упростите модель в редакторе: снимите фаски с невидимых рёбер, уберите внутреннюю геометрию, уменьшите число сегментов у скруглений',
    });
  }

  if (facts.maxTextureSize > ASSET_BUDGETS.maxTextureSize) {
    issues.push({
      code: 'texture-size',
      level: 'error',
      message: `Текстура ${facts.maxTextureSize} px при пределе ${ASSET_BUDGETS.maxTextureSize} px`,
      fix: `Уменьшите карты до ${ASSET_BUDGETS.maxTextureSize} px: на телефоне разницы не видно, а видеопамять кончается`,
    });
  }

  return issues;
}

/**
 * Материалы.
 *
 * Отделка подменяется клиентом по ИМЕНИ материала в модели: слот
 * «фасад» ищет материал с кодом из каталога тенанта. Модель с одним
 * материалом на всё изделие покрасить в два цвета невозможно.
 */
function checkMaterials(facts: ModelFacts): ModelIssue[] {
  const issues: ModelIssue[] = [];

  if (facts.materials.length === 0) {
    issues.push({
      code: 'materials-none',
      level: 'error',
      message: 'В модели нет ни одного материала',
      fix: 'Назначьте материалы в редакторе: по их именам подключается отделка',
    });
  }

  if (facts.materials.length > ASSET_BUDGETS.maxMaterialsPerAsset) {
    issues.push({
      code: 'materials-many',
      level: 'error',
      message: `${facts.materials.length} материалов при пределе ${ASSET_BUDGETS.maxMaterialsPerAsset}`,
      fix: 'Объедините материалы: каждый лишний — это отдельный вызов отрисовки, а их бюджет считается на всю сцену',
    });
  }

  if (facts.materials.length === 1) {
    issues.push({
      code: 'materials-single',
      level: 'note',
      message: 'Один материал на всё изделие: сменить отделку отдельно у фасада не получится',
      fix: 'Разделите материалы там, где покупатель выбирает цвет: корпус, фасад, столешница, фурнитура',
    });
  }

  const movable = facts.nodeNames.filter((name) => /^(door|drawer)/i.test(name));
  if (movable.length === 0) {
    issues.push({
      code: 'movable-none',
      level: 'note',
      message: 'В модели нет узлов door… и drawer…: дверцы и ящики открываться не будут',
      fix: 'Назовите подвижные детали door1, drawer1 и так далее — по этим именам их находит сцена',
    });
  }

  return issues;
}
