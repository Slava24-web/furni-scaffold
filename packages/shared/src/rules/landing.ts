import { boxAxes, type Box } from '../scene/box';
import { wallToBox } from '../scene/overlap';
import { projectOntoWall, wallDirection, type Vec2 } from '../scene/walls';
import type { Opening, Room, Wall } from '../scene/schema';
import { roundMm, type ErgonomicFinding } from './finding';
import { FULL_HEIGHT, pickRole, type KitchenItem } from './items';

/**
 * Рабочие зоны вокруг мойки, плиты, холодильника и посудомойки.
 *
 * Правила и числа — из NKBA Kitchen Planning Guidelines (31 правило,
 * руководства 11, 13, 16, 17, 20), переведённые из дюймов в миллиметры
 * и округлённые до пяти. Их же повторяют российские кухонные салоны,
 * иногда более мягкими цифрами; берём строгие.
 *
 * Все они об одном: техника и мойка живут не сами по себе, а внутри
 * рабочей поверхности. Мойка, вдвинутая в угол, формально ни с чем не
 * пересекается — и при этом рядом с ней некуда поставить мокрую тарелку,
 * а локоть упирается в перпендикулярную стену.
 */

/** NKBA 11: 24″ рабочей поверхности с одной стороны мойки. */
export const SINK_LANDING_MAIN_MM = 610;
/** NKBA 11: 18″ с другой стороны. */
export const SINK_LANDING_SECOND_MM = 455;
/**
 * NKBA 11, угловое исключение: со стороны внутреннего угла хватает 3″,
 * если с другой стороны есть 21″ сплошной поверхности.
 */
export const SINK_CORNER_MIN_MM = 75;
export const SINK_CORNER_RETURN_MM = 535;

/** NKBA 17: 15″ с одной стороны варочной поверхности и 12″ с другой. */
export const HOB_LANDING_MAIN_MM = 380;
export const HOB_LANDING_SECOND_MM = 305;
/**
 * Плита вплотную к перпендикулярной стене: ручки сковород упираются,
 * а стена рядом с конфоркой греется. Практика кухонных салонов —
 * не меньше 100 мм, лучше полноценная зона по NKBA 17.
 */
export const HOB_CORNER_MIN_MM = 100;

/** NKBA 16: 15″ рабочей поверхности у холодильника, куда ставят вынутое. */
export const FRIDGE_LANDING_MM = 380;

/** NKBA 13: 21″ на человека перед открытой посудомойкой. */
export const DISHWASHER_STANDING_MM = 535;

/**
 * Насколько далеко вперёд ищется препятствие.
 *
 * Соседний ряд стоит примерно на глубину столешницы впереди; всё, что
 * дальше, — это уже противоположная стена, и рабочей поверхности она
 * не мешает.
 */
const REACH_MM = 900;
/** Насколько препятствие может уехать вбок и всё ещё считаться в ряду. */
const SAME_RUN_MM = 600;
/** Косинус, ниже которого фронты считаются перпендикулярными. */
const PERPENDICULAR = 0.35;

/** Свободная рабочая поверхность слева и справа от изделия, мм. */
export interface Landing {
  left: number;
  right: number;
  /** Кто ограничил: по нему подсвечивается виновник */
  leftId: string | null;
  rightId: string | null;
}

const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/**
 * Насколько препятствие широко в системе координат изделия.
 *
 * Проекция полуразмеров на его поперечную ось: повёрнутый сосед
 * загораживает не свою ширину, а её проекцию.
 */
function lateralRadius(obstacle: Box, right: Vec2): number {
  const axes = boxAxes(obstacle);
  return (
    Math.abs(obstacle.halfWidthMm * dot(axes.right, right)) +
    Math.abs(obstacle.halfDepthMm * dot(axes.forward, right))
  );
}

interface Obstacle {
  box: Box;
  id: string | null;
}

/**
 * Что обрывает рабочую поверхность рядом с изделием.
 *
 * Три вида: колонна в том же ряду (холодильник, пенал), ряд, подошедший
 * под прямым углом, и перпендикулярная стена. Соседняя тумба в том же
 * ряду поверхность не обрывает — на ней и стоит столешница.
 */
function obstaclesAround(
  subject: KitchenItem,
  items: readonly KitchenItem[],
  walls: readonly Wall[],
  perpendicularOnly: boolean,
): Obstacle[] {
  const axes = boxAxes(subject.box);
  const found: Obstacle[] = [];

  for (const item of items) {
    if (item.instanceId === subject.instanceId) continue;

    const between = {
      x: item.centre.x - subject.centre.x,
      y: item.centre.y - subject.centre.y,
    };
    const ahead = dot(between, axes.forward);
    if (ahead > REACH_MM || ahead < -REACH_MM) continue;

    const facing = dot(boxAxes(item.box).forward, axes.forward);
    const perpendicular = Math.abs(facing) < PERPENDICULAR;
    const columnInRun =
      !perpendicularOnly && FULL_HEIGHT.has(item.role) && Math.abs(ahead) <= SAME_RUN_MM;

    if (!perpendicular && !columnInRun) continue;
    found.push({ box: item.box, id: item.instanceId });
  }

  for (const wall of walls) {
    // Стена, вдоль которой идёт ряд, поверхность не обрывает: об неё
    // столешница и упирается задней кромкой
    if (Math.abs(dot(wallDirection(wall), axes.right)) > PERPENDICULAR) continue;
    found.push({ box: wallToBox(wall), id: null });
  }

  return found;
}

/**
 * Свободная поверхность по обе стороны изделия.
 *
 * Бесконечность означает «ничто не мешает»: открытый торец ряда — это
 * не ограничение, туда можно поставить что угодно.
 */
export function sideClearance(
  subject: KitchenItem,
  items: readonly KitchenItem[],
  walls: readonly Wall[],
  options: { perpendicularOnly?: boolean } = {},
): Landing {
  const axes = boxAxes(subject.box);
  const landing: Landing = {
    left: Number.POSITIVE_INFINITY,
    right: Number.POSITIVE_INFINITY,
    leftId: null,
    rightId: null,
  };

  for (const obstacle of obstaclesAround(subject, items, walls, options.perpendicularOnly ?? false)) {
    const between = {
      x: obstacle.box.centre.x - subject.centre.x,
      y: obstacle.box.centre.y - subject.centre.y,
    };
    const lateral = dot(between, axes.right);
    const gap =
      Math.abs(lateral) - lateralRadius(obstacle.box, axes.right) - subject.box.halfWidthMm;
    const free = Math.max(0, gap);

    if (lateral >= 0) {
      if (free < landing.right) {
        landing.right = free;
        landing.rightId = obstacle.id;
      }
    } else if (free < landing.left) {
      landing.left = free;
      landing.leftId = obstacle.id;
    }
  }

  return landing;
}

/** Наименьшая и наибольшая из двух сторон плюс виновник тесной стороны. */
function sides(landing: Landing): { smaller: number; larger: number; blame: string[] } {
  const leftIsSmaller = landing.left <= landing.right;
  const blame = leftIsSmaller ? landing.leftId : landing.rightId;
  return {
    smaller: leftIsSmaller ? landing.left : landing.right,
    larger: leftIsSmaller ? landing.right : landing.left,
    blame: blame ? [blame] : [],
  };
}

/**
 * Мойка в углу.
 *
 * Самая частая ошибка планировки: угол кажется бросовым местом, и туда
 * задвигают мойку. На деле рядом с мойкой нужна поверхность под мокрую
 * посуду с обеих сторон, а перпендикулярная стена ещё и упирается
 * в локоть моющего.
 */
function sinkLanding(
  items: readonly KitchenItem[],
  walls: readonly Wall[],
): ErgonomicFinding[] {
  const findings: ErgonomicFinding[] = [];

  for (const sink of pickRole(items, 'sink')) {
    const { smaller, larger, blame } = sides(sideClearance(sink, items, walls));
    const ids = [sink.instanceId, ...blame];

    if (smaller < SINK_CORNER_MIN_MM) {
      findings.push({
        code: 'sink-in-corner',
        severity: 'warning',
        message: `Мойка упирается в угол: сбоку ${roundMm(smaller)} мм. Мокрую посуду поставить некуда, а локоть бьётся о стену. Сдвиньте её от угла хотя бы на ${SINK_CORNER_RETURN_MM} мм`,
        instanceIds: ids,
      });
      continue;
    }

    // Угловое исключение NKBA: узкая сторона допустима, если с другой
    // стороны есть полноценная рабочая зона
    if (smaller >= SINK_CORNER_MIN_MM && larger >= SINK_CORNER_RETURN_MM) {
      if (smaller >= SINK_LANDING_SECOND_MM && larger >= SINK_LANDING_MAIN_MM) continue;
      findings.push({
        code: 'sink-landing-tight',
        severity: 'note',
        message: `С одной стороны мойки ${roundMm(smaller)} мм поверхности. Удобно, когда с одной стороны ${SINK_LANDING_MAIN_MM} мм, а с другой ${SINK_LANDING_SECOND_MM} мм`,
        instanceIds: ids,
      });
      continue;
    }

    findings.push({
      code: 'sink-landing',
      severity: 'warning',
      message: `Рядом с мойкой мало места: ${roundMm(smaller)} и ${roundMm(larger)} мм. Нужно ${SINK_LANDING_MAIN_MM} мм с одной стороны и ${SINK_LANDING_SECOND_MM} мм с другой`,
      instanceIds: ids,
    });
  }

  return findings;
}

/** Варочная поверхность: место под сковороду и зазор от перпендикулярной стены. */
function hobLanding(
  items: readonly KitchenItem[],
  walls: readonly Wall[],
): ErgonomicFinding[] {
  const findings: ErgonomicFinding[] = [];

  for (const hob of pickRole(items, 'hob')) {
    const { smaller, larger, blame } = sides(sideClearance(hob, items, walls));
    const ids = [hob.instanceId, ...blame];

    if (smaller < HOB_CORNER_MIN_MM) {
      findings.push({
        code: 'hob-in-corner',
        severity: 'warning',
        message: `Плита в углу: сбоку ${roundMm(smaller)} мм. Ручки сковород упираются в стену, а сама стена рядом с конфоркой греется`,
        instanceIds: ids,
      });
      continue;
    }

    if (larger < HOB_LANDING_MAIN_MM || smaller < HOB_LANDING_SECOND_MM) {
      findings.push({
        code: 'hob-landing',
        severity: 'warning',
        message: `У плиты ${roundMm(smaller)} и ${roundMm(larger)} мм поверхности по сторонам. Горячее снимать некуда: нужно ${HOB_LANDING_MAIN_MM} мм с одной стороны и ${HOB_LANDING_SECOND_MM} мм с другой`,
        instanceIds: ids,
      });
    }
  }

  return findings;
}

/**
 * Плита под окном.
 *
 * NKBA 20 запрещает ставить варочную поверхность под открывающееся окно:
 * занавеска и створка попадают на конфорку, а тянуться к ручке окна
 * приходится над огнём.
 */
function hobUnderWindow(
  items: readonly KitchenItem[],
  rooms: readonly Room[],
): ErgonomicFinding[] {
  const findings: ErgonomicFinding[] = [];
  const hobs = pickRole(items, 'hob');
  if (hobs.length === 0) return findings;

  for (const room of rooms) {
    const windows = room.openings.filter((opening) => opening.kind === 'window');
    if (windows.length === 0) continue;

    for (const hob of hobs) {
      for (const window of windows) {
        const wall = room.walls.find((candidate) => candidate.id === window.wallId);
        if (!wall || !overlapsOpening(hob, wall, window)) continue;

        findings.push({
          code: 'hob-under-window',
          severity: 'warning',
          message: 'Плита под окном. Створка и занавеска попадают на конфорку, а до ручки окна тянуться над огнём',
          instanceIds: [hob.instanceId],
        });
      }
    }
  }

  return findings;
}

/** Стоит ли изделие в створе проёма и достаточно ли близко к стене. */
function overlapsOpening(item: KitchenItem, wall: Wall, opening: Opening): boolean {
  const projection = projectOntoWall(wall, item.centre);
  // Изделие у противоположной стены под этим окном не стоит
  if (projection.distanceMm > item.box.halfDepthMm + wall.thickness) return false;

  const half = item.box.halfWidthMm;
  return (
    projection.offsetMm + half > opening.offset &&
    projection.offsetMm - half < opening.offset + opening.width
  );
}

/** У холодильника нужна поверхность, куда ставят вынутое. */
function fridgeLanding(
  items: readonly KitchenItem[],
  walls: readonly Wall[],
): ErgonomicFinding[] {
  const findings: ErgonomicFinding[] = [];

  for (const fridge of pickRole(items, 'fridge')) {
    const { larger, blame } = sides(sideClearance(fridge, items, walls));
    if (larger >= FRIDGE_LANDING_MM) continue;

    findings.push({
      code: 'fridge-landing',
      severity: 'note',
      message: `У холодильника ${roundMm(larger)} мм поверхности рядом. Вынутое ставить некуда: нужно ${FRIDGE_LANDING_MM} мм хотя бы с одной стороны`,
      instanceIds: [fridge.instanceId, ...blame],
    });
  }

  return findings;
}

/**
 * Место перед посудомойкой.
 *
 * NKBA 13: перед открытой дверцей должен помещаться человек. Считается
 * до того, что стоит под прямым углом, — соседняя тумба в том же ряду
 * не мешает, а угол мешает.
 */
function dishwasherStanding(
  items: readonly KitchenItem[],
  walls: readonly Wall[],
): ErgonomicFinding[] {
  const findings: ErgonomicFinding[] = [];

  for (const dishwasher of pickRole(items, 'dishwasher')) {
    const { smaller, blame } = sides(
      sideClearance(dishwasher, items, walls, { perpendicularOnly: true }),
    );
    if (smaller >= DISHWASHER_STANDING_MM) continue;

    findings.push({
      code: 'dishwasher-standing',
      severity: 'warning',
      message: `Сбоку от посудомойки ${roundMm(smaller)} мм до угла. Перед открытой дверцей должен помещаться человек: нужно ${DISHWASHER_STANDING_MM} мм`,
      instanceIds: [dishwasher.instanceId, ...blame],
    });
  }

  return findings;
}

/** Все правила рабочих зон одним списком. */
export function checkLanding(
  items: readonly KitchenItem[],
  rooms: readonly Room[],
): ErgonomicFinding[] {
  const walls = rooms.flatMap((room) => room.walls);

  return [
    ...sinkLanding(items, walls),
    ...hobLanding(items, walls),
    ...hobUnderWindow(items, rooms),
    ...fridgeLanding(items, walls),
    ...dishwasherStanding(items, walls),
  ];
}
