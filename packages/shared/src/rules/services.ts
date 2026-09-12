import { nearestServiceMm } from '../scene/services';
import { placementBox } from '../scene/collision';
import { placementProductSize } from '../scene/resize';
import type { CatalogProduct } from '../catalog/schema';
import type { Placement, ServicePoint, ServicePointKind } from '../scene/schema';
import type { ErgonomicFinding } from './ergonomics';

/**
 * Проверка подключений.
 *
 * Мебель может стоять идеально и всё равно не подключаться: мойка без
 * воды, посудомойка без слива, вытяжка без канала. Это те самые
 * переделки, которые обнаруживаются на монтаже, когда кухня уже
 * привезена.
 *
 * Проверка молчит, пока в сцене нет ни одной инженерной точки: пустой
 * список означает «инженерию ещё не размечали», а не «подключений нет».
 * Ругаться на каждый модуль в пустом плане значит приучить нажимать
 * «закрыть» не глядя.
 */

/** Дотянуться от прибора до вывода: дальше нужен удлинитель или штроба. */
export const MAX_SERVICE_REACH_MM = 1500;
/** Вытяжку к каналу тянут гофрой; длинная гофра не тянет. */
export const MAX_VENT_REACH_MM = 2500;

interface Requirement {
  role: CatalogProduct['role'];
  kinds: readonly ServicePointKind[];
  reachMm: number;
}

/**
 * Что чему нужно.
 *
 * Газовая плита требует газ, электрическая — розетку; различить их по
 * роли нельзя, поэтому у плиты спрашивается любое из двух.
 */
const REQUIREMENTS: readonly Requirement[] = [
  { role: 'sink', kinds: ['water', 'drain'], reachMm: MAX_SERVICE_REACH_MM },
  { role: 'dishwasher', kinds: ['water', 'drain', 'socket'], reachMm: MAX_SERVICE_REACH_MM },
  { role: 'washer', kinds: ['water', 'drain', 'socket'], reachMm: MAX_SERVICE_REACH_MM },
  { role: 'oven', kinds: ['socket'], reachMm: MAX_SERVICE_REACH_MM },
  { role: 'fridge', kinds: ['socket'], reachMm: MAX_SERVICE_REACH_MM },
  { role: 'microwave', kinds: ['socket'], reachMm: MAX_SERVICE_REACH_MM },
  { role: 'hood', kinds: ['vent'], reachMm: MAX_VENT_REACH_MM },
];

const KIND_NAMES: Record<ServicePointKind, string> = {
  socket: 'розетки',
  switch: 'выключателя',
  water: 'вывода воды',
  drain: 'слива',
  vent: 'вентканала',
  gas: 'газа',
};

export function checkServices(
  placements: readonly Placement[],
  products: ReadonlyMap<string, CatalogProduct>,
  services: readonly ServicePoint[],
): ErgonomicFinding[] {
  if (services.length === 0) return [];

  const findings: ErgonomicFinding[] = [];

  for (const placement of placements) {
    const product = products.get(placement.sku);
    if (!product) continue;

    const requirement = REQUIREMENTS.find((item) => item.role === product.role);
    const centre = placementBox(placement, placementProductSize(placement, product)).centre;

    // Плита особая: годится и газ, и розетка — смотря какая
    if (product.role === 'hob') {
      const gas = nearestServiceMm(services, 'gas', centre);
      const socket = nearestServiceMm(services, 'socket', centre);
      const reach = Math.min(gas ?? Infinity, socket ?? Infinity);

      if (reach > MAX_SERVICE_REACH_MM) {
        findings.push({
          code: 'hob-no-supply',
          severity: 'warning',
          message: `Плите «${product.name}» нечем питаться: рядом нет ни газа, ни розетки`,
          instanceIds: [placement.instanceId],
        });
      }
      continue;
    }

    if (!requirement) continue;

    const missing = requirement.kinds.filter((kind) => {
      const distance = nearestServiceMm(services, kind, centre);
      return distance === null || distance > requirement.reachMm;
    });

    if (missing.length === 0) continue;

    findings.push({
      code: `service-${product.role}`,
      severity: 'warning',
      message: `«${product.name}»: рядом нет ${missing.map((kind) => KIND_NAMES[kind]).join(', ')}`,
      instanceIds: [placement.instanceId],
    });
  }

  return findings;
}
