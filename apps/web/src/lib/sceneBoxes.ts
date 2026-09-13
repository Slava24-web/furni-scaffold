import {
  clampToRoom,
  drawerZone,
  placementBox,
  placementProductSize,
  resolveOverlaps,
  swingZones,
  type Box,
  type CatalogProduct,
  type Placement,
  type Room,
  type RoomBoundsMm,
  type SwingZone,
  type Wall,
} from '@furni/shared';

/**
 * Габариты сцены для проверок и жестов.
 *
 * Чистые функции над документом и каталогом: ни Vue, ни Three.js. Здесь
 * живёт то, что раньше было размазано по обработчику жестов, — обход
 * сцены в горячем пути стоит дорого, и его надо видеть в одном месте,
 * а не искать по тысяче строк.
 */

export interface IdentifiedBox {
  instanceId: string;
  box: Box;
}

/** Все стены документа одним списком. */
export function allWalls(rooms: readonly Room[]): Wall[] {
  return rooms.flatMap((room) => room.walls);
}

/** Зоны открывания всех дверей документа. */
export function allSwings(rooms: readonly Room[]): SwingZone[] {
  return rooms.flatMap((room) => swingZones(room));
}

/**
 * Габарит размещения с учётом заказанного размера.
 * Товар не из каталога габарита не имеет: показать его нечем.
 */
export function boxOf(
  placement: Placement,
  products: ReadonlyMap<string, CatalogProduct>,
): Box | null {
  const product = products.get(placement.sku);
  return product ? placementBox(placement, placementProductSize(placement, product)) : null;
}

/** Габариты остальных объектов сцены. Товары без каталога пропускаются. */
export function neighbourBoxes(
  placements: readonly Placement[],
  products: ReadonlyMap<string, CatalogProduct>,
  exceptId: string | null,
): IdentifiedBox[] {
  const boxes: IdentifiedBox[] = [];
  for (const placement of placements) {
    if (placement.instanceId === exceptId) continue;
    const box = boxOf(placement, products);
    if (box) boxes.push({ instanceId: placement.instanceId, box });
  }
  return boxes;
}

/** Зона выдвижения ящиков размещения. null — ящиков нет. */
export function drawerZoneOf(
  placement: Placement,
  products: ReadonlyMap<string, CatalogProduct>,
): Box | null {
  const product = products.get(placement.sku);
  return product ? drawerZone(placement, product) : null;
}

/** Зоны выдвижения соседей: перед ними нельзя ставить объекты. */
export function neighbourDrawerZones(
  placements: readonly Placement[],
  products: ReadonlyMap<string, CatalogProduct>,
  exceptId: string | null,
): IdentifiedBox[] {
  const zones: IdentifiedBox[] = [];
  for (const placement of placements) {
    if (placement.instanceId === exceptId) continue;
    const box = drawerZoneOf(placement, products);
    if (box) zones.push({ instanceId: placement.instanceId, box });
  }
  return zones;
}

export interface ConfineOptions {
  halfWidthMm: number;
  halfDepthMm: number;
  rotationDeg: number;
  bottomMm: number;
  topMm: number;
  obstacles: readonly Box[];
  bounds: RoomBoundsMm | null;
}

/**
 * Позиция, в которую объект действительно можно поставить.
 *
 * Сначала объект выталкивается из соседей, потом прижимается к стенам,
 * и так дважды: выталкивание могло увести его за стену, а прижатие —
 * обратно в соседа. Двух проходов хватает на обычную расстановку, а
 * бесконечный поиск в углу между тремя модулями стоил бы кадра.
 *
 * Пересечение по высоте обязательно для выталкивания, поэтому
 * постановка НА другой объект остаётся разрешённой: мойку кладут на
 * столешницу, а не рядом с ней.
 */
export function confine(
  position: { x: number; y: number },
  options: ConfineOptions,
): { x: number; y: number } {
  const footprint = {
    halfWidthMm: options.halfWidthMm,
    halfDepthMm: options.halfDepthMm,
    rotationDeg: options.rotationDeg,
  };

  let centre = clampToRoom(position, footprint, options.bounds);
  for (let pass = 0; pass < 2; pass++) {
    const box: Box = {
      centre,
      halfWidthMm: options.halfWidthMm,
      halfDepthMm: options.halfDepthMm,
      rotationDeg: options.rotationDeg,
      bottomMm: options.bottomMm,
      topMm: options.topMm,
    };
    centre = clampToRoom(resolveOverlaps(box, options.obstacles), footprint, options.bounds);
  }

  return centre;
}
