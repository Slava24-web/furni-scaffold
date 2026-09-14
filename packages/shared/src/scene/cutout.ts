/**
 * Вырез в плите под врезное изделие.
 *
 * Мойку и варочную панель врезают в столешницу: в камне выпиливают
 * прямоугольное окно, изделие ложится в него бортиком на плиту, а чаша
 * уходит вниз. Без выреза мойка выглядит закрытой тарелкой — сверху
 * видно камень, а не чашу, и понять, что это мойка, невозможно.
 *
 * Пайплайн выреза сделать не может: он не знает, где встанет мойка.
 * Поэтому плита приезжает целой, а окно в ней считается здесь — по
 * положению врезанных изделий в сцене.
 *
 * Здесь только прямоугольники: настоящие вырезы прямоугольные (у круглой
 * мойки тоже — её сажают в квадратное окно с закруглением по углам),
 * а булева операция над мешем ради скруглений стоила бы кадра.
 */

export interface Rect {
  /** Центр в плане, мм */
  x: number;
  y: number;
  widthMm: number;
  depthMm: number;
}

const left = (r: Rect): number => r.x - r.widthMm / 2;
const right = (r: Rect): number => r.x + r.widthMm / 2;
const front = (r: Rect): number => r.y + r.depthMm / 2;
const back = (r: Rect): number => r.y - r.depthMm / 2;

const overlaps = (a: Rect, b: Rect): boolean =>
  left(a) < right(b) && left(b) < right(a) && back(a) < front(b) && back(b) < front(a);

const fromEdges = (x0: number, x1: number, y0: number, y1: number): Rect => ({
  x: (x0 + x1) / 2,
  y: (y0 + y1) / 2,
  widthMm: x1 - x0,
  depthMm: y1 - y0,
});

/** Пренебрежимо узкая полоса: результат пилы, а не деталь. */
const SLIVER_MM = 0.5;

/**
 * Плита без одного окна: до четырёх полос вокруг выреза.
 *
 * Разрез идёт сначала по глубине, потом по ширине остатка — так
 * получаются полосы, а не лоскуты, и их меньше.
 */
function subtractOne(slab: Rect, hole: Rect): Rect[] {
  if (!overlaps(slab, hole)) return [slab];

  const x0 = Math.max(left(slab), left(hole));
  const x1 = Math.min(right(slab), right(hole));
  const y0 = Math.max(back(slab), back(hole));
  const y1 = Math.min(front(slab), front(hole));

  const pieces: Rect[] = [];

  // Полосы слева и справа во всю глубину плиты
  if (x0 - left(slab) > SLIVER_MM) pieces.push(fromEdges(left(slab), x0, back(slab), front(slab)));
  if (right(slab) - x1 > SLIVER_MM) pieces.push(fromEdges(x1, right(slab), back(slab), front(slab)));

  // Перемычки спереди и сзади от окна, в его ширину
  if (y0 - back(slab) > SLIVER_MM) pieces.push(fromEdges(x0, x1, back(slab), y0));
  if (front(slab) - y1 > SLIVER_MM) pieces.push(fromEdges(x0, x1, y1, front(slab)));

  return pieces;
}

/**
 * Плита, из которой вырезаны все окна.
 *
 * Окна вычитаются по очереди: каждое режет те полосы, которых касается.
 * Порядок на результат не влияет — окна не пересекаются между собой,
 * иначе это одно окно.
 */
export function subtractRects(slab: Rect, holes: readonly Rect[]): Rect[] {
  let pieces = [slab];

  for (const hole of holes) {
    pieces = pieces.flatMap((piece) => subtractOne(piece, hole));
  }

  return pieces;
}

/** Есть ли что вырезать: окно должно попадать в плиту. */
export const cutsInto = (slab: Rect, hole: Rect): boolean => overlaps(slab, hole);
