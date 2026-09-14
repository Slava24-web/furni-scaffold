/**
 * Построители геометрии для тестовых моделей.
 *
 * Отдают сырые буферы в соглашениях glTF: метры, ось Y вверх,
 * треугольники, индексированные примитивы. Позиции задаются относительно
 * origin модели, а он по контракту проекта — низ-центр габарита
 * (CLAUDE.md, конвенции). В БД размеры хранятся в миллиметрах, поэтому
 * все входные параметры здесь тоже в мм и делятся на 1000 на границе.
 */

const MM = 1000;

/** @typedef {{positions: number[], normals: number[], uvs: number[], indices: number[]}} Geometry */

export function emptyGeometry() {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

/**
 * Слияние геометрий в одну. Меньше примитивов — меньше draw calls,
 * а бюджет на них жёсткий (RENDER_BUDGETS.maxDrawCalls).
 */
export function mergeGeometries(parts) {
  const out = emptyGeometry();
  for (const part of parts) {
    const offset = out.positions.length / 3;
    out.positions.push(...part.positions);
    out.normals.push(...part.normals);
    out.uvs.push(...part.uvs);
    for (const index of part.indices) out.indices.push(index + offset);
  }
  return out;
}

/** Сдвиг геометрии. Мутирует переданный объект — вызывается на свежих буферах. */
export function translate(geometry, xMm, yMm, zMm) {
  const [x, y, z] = [xMm / MM, yMm / MM, zMm / MM];
  for (let i = 0; i < geometry.positions.length; i += 3) {
    geometry.positions[i] += x;
    geometry.positions[i + 1] += y;
    geometry.positions[i + 2] += z;
  }
  return geometry;
}

/**
 * Пометка детали как листовой панели для карты раскроя.
 *
 * Размеры записываются теми же числами, которыми деталь построена, а не
 * измеряются по геометрии: у филёнчатого фасада пять деталей, а закажут
 * его одной панелью, и габарит по вершинам дал бы не тот размер.
 *
 * Метка живёт на самой геометрии до слияния по материалам: после него
 * отдельных деталей уже нет.
 */
export function markPanel(geometry, name, widthMm, heightMm, thicknessMm, options = {}) {
  const width = Math.round(widthMm);
  const height = Math.round(heightMm);

  geometry.panel = {
    name,
    /** Вид детали: по нему считается фурнитура, а не по названию */
    kind: options.kind ?? 'other',
    /**
     * Каким осям изделия отвечают стороны детали.
     *
     * Нужно раскрою растянутого изделия: у боковины по высоте идёт
     * высота корпуса, а по ширине — его глубина, и тянуть их надо
     * разными множителями.
     */
    axes: options.axes ?? 'wh',
    widthMm: width,
    heightMm: height,
    thicknessMm: Math.round(thicknessMm),
    // Деталь с направленным рисунком нельзя повернуть при раскрое
    grain: options.grain ?? false,
    /**
     * Длина кромки и её толщина. Кромкуют не всё: задняя стенка из ХДФ
     * уходит в паз, а невидимые торцы корпуса оставляют голыми —
     * заказывать кромку на них значит платить за то, чего никто не увидит.
     */
    edgeLengthMm: Math.round(options.edgeLengthMm ?? 0),
    edgeThicknessMm: options.edgeThicknessMm ?? 0,
  };
  return geometry;
}

/** Периметр детали: столько кромки уходит на фасад. */
export function perimeterMm(widthMm, heightMm) {
  return Math.round((widthMm + heightMm) * 2);
}

/**
 * Поворот геометрии вокруг оси X. Мутирует переданный объект.
 *
 * Нормали поворачиваются вместе с позициями: без этого деталь остаётся
 * освещённой так, будто её не трогали, и наклонная панель вытяжки
 * бликует как горизонтальная.
 */
export function rotateX(geometry, radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  for (const buffer of [geometry.positions, geometry.normals]) {
    for (let i = 0; i < buffer.length; i += 3) {
      const y = buffer[i + 1];
      const z = buffer[i + 2];
      buffer[i + 1] = y * cos - z * sin;
      buffer[i + 2] = y * sin + z * cos;
    }
  }
  return geometry;
}

/**
 * Поворот вокруг оси Z.
 *
 * Нужен горизонтальным цилиндрам: cylinder строит трубу вдоль Y, а
 * рейлинг ручки и излив смесителя лежат вдоль X. Брусок со скруглением
 * вместо трубы виден на просвет — у него по контуру восемь граней,
 * а не окружность.
 */
export function rotateZ(geometry, radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  for (const buffer of [geometry.positions, geometry.normals]) {
    for (let i = 0; i < buffer.length; i += 3) {
      const x = buffer[i];
      const y = buffer[i + 1];
      buffer[i] = x * cos - y * sin;
      buffer[i + 1] = x * sin + y * cos;
    }
  }
  return geometry;
}

/**
 * Труба вдоль оси X: цилиндр, положенный набок.
 * Ею собираются рейлинги ручек и трубчатые опоры.
 */
export function tubeX(radiusMm, lengthMm, radialSegments = 12) {
  return rotateZ(cylinder(radiusMm, lengthMm, radialSegments), Math.PI / 2);
}

/**
 * Труба вдоль оси Z: цилиндр, положенный вдоль глубины.
 * Ею собираются излив смесителя и вертикальные ручки в плане.
 */
export function tubeZ(radiusMm, lengthMm, radialSegments = 12) {
  return rotateX(cylinder(radiusMm, lengthMm, radialSegments), Math.PI / 2);
}

/**
 * Кольцо: труба, положенная плашмя. Строится из сегментов-брусков.
 *
 * Нужно контурам конфорок и сливному отверстию мойки — деталям, которые
 * читаются именно как окружность, а не как диск.
 */
export function ring(radiusMm, thicknessMm, heightMm, segments = 16) {
  const parts = [];
  const step = (Math.PI * 2) / segments;
  // Хорда чуть длиннее шага дуги: иначе между сегментами видны щели
  const chord = 2 * radiusMm * Math.tan(step / 2) + thicknessMm / 2;

  for (let i = 0; i < segments; i++) {
    const angle = i * step;
    const piece = segmentedBox(chord, heightMm, thicknessMm, 1);
    rotateY(piece, -angle);
    translate(piece, Math.sin(angle) * radiusMm, 0, Math.cos(angle) * radiusMm);
    parts.push(piece);
  }

  return mergeGeometries(parts);
}

/** Поворот вокруг вертикальной оси. */
export function rotateY(geometry, radians) {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  for (const buffer of [geometry.positions, geometry.normals]) {
    for (let i = 0; i < buffer.length; i += 3) {
      const x = buffer[i];
      const z = buffer[i + 2];
      buffer[i] = x * cos + z * sin;
      buffer[i + 2] = -x * sin + z * cos;
    }
  }
  return geometry;
}

/**
 * Грани параллелепипеда: [нормаль, ось U, ось V].
 *
 * Для каждой грани обязано выполняться U x V = нормаль. Вместе с порядком
 * индексов ниже это даёт обход вершин против часовой стрелки при взгляде
 * снаружи — только такие треугольники Three.js считает лицевыми. Грань
 * с обратным обходом отсекается, и сквозь мебель видно фон.
 */
const FACES = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];

/**
 * Параллелепипед с разбиением граней на сетку.
 *
 * Сегменты нужны не для красоты: без них meshopt-упрощению нечего резать,
 * и LOD1/LOD2 получаются такими же тяжёлыми, как LOD0. Плоские панели
 * мебели без тесселяции делают проверку пайплайна бессмысленной.
 */
export function segmentedBox(widthMm, heightMm, depthMm, segments = 1) {
  const half = [widthMm / MM / 2, heightMm / MM / 2, depthMm / MM / 2];
  const geometry = emptyGeometry();

  for (const [normal, uAxis, vAxis] of FACES) {
    const base = geometry.positions.length / 3;

    for (let iv = 0; iv <= segments; iv++) {
      for (let iu = 0; iu <= segments; iu++) {
        const u = iu / segments - 0.5;
        const v = iv / segments - 0.5;
        for (let axis = 0; axis < 3; axis++) {
          geometry.positions.push(
            (normal[axis] * 0.5 + uAxis[axis] * u + vAxis[axis] * v) * 2 * half[axis],
          );
        }
        geometry.normals.push(...normal);
        geometry.uvs.push(u + 0.5, v + 0.5);
      }
    }

    const stride = segments + 1;
    for (let iv = 0; iv < segments; iv++) {
      for (let iu = 0; iu < segments; iu++) {
        const a = base + iv * stride + iu;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        // Обход a->b->c даёт нормаль U x V, то есть наружу грани
        geometry.indices.push(a, b, c, b, d, c);
      }
    }
  }

  return geometry;
}

/**
 * Усечённая пирамида с прямоугольным основанием.
 *
 * Купол вытяжки, свод камина, ножка-конус с прямыми гранями — всё, что
 * сужается кверху. Раньше такие формы собирались из двух коробок друг
 * на друге, и ступенька между ними читалась как ошибка сборки, а не как
 * скос: у настоящей вытяжки грань идёт одной сплошной плоскостью.
 *
 * Нормали боковых граней считаются по наклону, а не берутся по осям:
 * с осевой нормалью скос освещается как вертикальная стенка и выглядит
 * плоским пятном.
 *
 * @param {number} bottomWidthMm ширина у основания
 * @param {number} bottomDepthMm глубина у основания
 * @param {number} topWidthMm ширина у вершины
 * @param {number} topDepthMm глубина у вершины
 * @param {number} heightMm высота
 * @param {{segments?: number, capTop?: boolean, capBottom?: boolean}} [options]
 */
export function taperedBox(
  bottomWidthMm,
  bottomDepthMm,
  topWidthMm,
  topDepthMm,
  heightMm,
  options = {},
) {
  const { segments = 4, capTop = true, capBottom = true } = options;
  const geometry = emptyGeometry();

  const h = heightMm / MM;
  const bw = bottomWidthMm / MM / 2;
  const bd = bottomDepthMm / MM / 2;
  const tw = topWidthMm / MM / 2;
  const td = topDepthMm / MM / 2;

  // Стороны обходятся по кругу: +X, +Z, -X, -Z
  const sides = [
    { axis: 'x', sign: 1 },
    { axis: 'z', sign: 1 },
    { axis: 'x', sign: -1 },
    { axis: 'z', sign: -1 },
  ];

  for (const side of sides) {
    const base = geometry.positions.length / 3;
    const alongX = side.axis === 'z';

    // Наклон грани: на сколько она уходит внутрь по высоте
    const halfBottom = side.axis === 'x' ? bw : bd;
    const halfTop = side.axis === 'x' ? tw : td;
    const run = halfBottom - halfTop;
    const length = Math.hypot(run, h) || 1;
    // Нормаль перпендикулярна образующей: (h, run) повёрнутое наружу
    const nOut = (h / length) * side.sign;
    const nUp = run / length;

    for (let iv = 0; iv <= segments; iv++) {
      const t = iv / segments;
      const half = halfBottom + (halfTop - halfBottom) * t;
      const other = alongX
        ? bw + (tw - bw) * t
        : bd + (td - bd) * t;
      const y = h * t;

      for (let iu = 0; iu <= segments; iu++) {
        const u = iu / segments - 0.5;
        // Направление обхода разворачивается вместе со стороной: иначе
        // треугольники дальних граней смотрят внутрь, и модель видно
        // насквозь с одной стороны
        const across = u * 2 * other * side.sign;

        if (alongX) {
          geometry.positions.push(across, y, side.sign * half);
          geometry.normals.push(0, nUp, nOut);
        } else {
          geometry.positions.push(side.sign * half, y, -across);
          geometry.normals.push(nOut, nUp, 0);
        }
        geometry.uvs.push(u + 0.5, t);
      }
    }

    const stride = segments + 1;
    for (let iv = 0; iv < segments; iv++) {
      for (let iu = 0; iu < segments; iu++) {
        const a = base + iv * stride + iu;
        geometry.indices.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
      }
    }
  }

  if (capBottom) {
    geometry.indices.push(...quad(geometry, [
      [-bw, 0, -bd], [bw, 0, -bd], [bw, 0, bd], [-bw, 0, bd],
    ], [0, -1, 0]));
  }
  if (capTop) {
    geometry.indices.push(...quad(geometry, [
      [-tw, h, -td], [-tw, h, td], [tw, h, td], [tw, h, -td],
    ], [0, 1, 0]));
  }

  return geometry;
}

/** Четырёхугольник с общей нормалью: крышка и дно усечённой пирамиды. */
function quad(geometry, corners, normal) {
  const base = geometry.positions.length / 3;
  for (const [x, y, z] of corners) {
    geometry.positions.push(x, y, z);
    geometry.normals.push(...normal);
    geometry.uvs.push(x + 0.5, z + 0.5);
  }
  return [base, base + 1, base + 2, base, base + 2, base + 3];
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Скруглённый параллелепипед: мягкие формы мягкой мебели и столешниц.
 *
 * Строится проекцией сегментированного бокса на скруглённую оболочку —
 * каждая вершина прижимается к внутреннему боксу и выносится наружу на
 * радиус. Способ даёт непрерывную поверхность без шва, в отличие от
 * трюка со знаком координаты, который рвёт геометрию по нулевым плоскостям.
 */
export function roundedBox(widthMm, heightMm, depthMm, radiusMm, segments = 6) {
  const maxRadius = Math.min(widthMm, heightMm, depthMm) / 2;
  const radius = clamp(radiusMm, 0, maxRadius) / MM;
  const geometry = segmentedBox(widthMm, heightMm, depthMm, segments);

  const inner = [
    widthMm / MM / 2 - radius,
    heightMm / MM / 2 - radius,
    depthMm / MM / 2 - radius,
  ];

  for (let i = 0; i < geometry.positions.length; i += 3) {
    const point = [geometry.positions[i], geometry.positions[i + 1], geometry.positions[i + 2]];
    const anchor = [
      clamp(point[0], -inner[0], inner[0]),
      clamp(point[1], -inner[1], inner[1]),
      clamp(point[2], -inner[2], inner[2]),
    ];

    const delta = [point[0] - anchor[0], point[1] - anchor[1], point[2] - anchor[2]];
    const length = Math.hypot(...delta);

    // Нулевой радиус: вершина совпадает с опорной точкой, направление
    // выноса не определено. Нормаль грани, посчитанную боксом, в этом
    // случае оставляем — обнулить её значит погасить освещение детали
    if (length < 1e-9) continue;

    const normal = delta.map((d) => d / length);
    for (let axis = 0; axis < 3; axis++) {
      geometry.positions[i + axis] = anchor[axis] + normal[axis] * radius;
      geometry.normals[i + axis] = normal[axis];
    }
  }

  return geometry;
}

/** Цилиндр вдоль оси Y: ножки, ручки, штанги. */
export function cylinder(radiusMm, heightMm, radialSegments = 12) {
  const radius = radiusMm / MM;
  const halfHeight = heightMm / MM / 2;
  const geometry = emptyGeometry();

  for (let iy = 0; iy <= 1; iy++) {
    for (let i = 0; i <= radialSegments; i++) {
      const angle = (i / radialSegments) * Math.PI * 2;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      geometry.positions.push(x * radius, iy === 0 ? -halfHeight : halfHeight, z * radius);
      geometry.normals.push(x, 0, z);
      geometry.uvs.push(i / radialSegments, iy);
    }
  }

  const stride = radialSegments + 1;
  for (let i = 0; i < radialSegments; i++) {
    const a = i;
    const b = i + 1;
    const c = i + stride;
    const d = i + stride + 1;
    geometry.indices.push(a, c, b, b, c, d);
  }

  // Крышки: веер треугольников от центра
  for (const [sign, y] of [[-1, -halfHeight], [1, halfHeight]]) {
    const center = geometry.positions.length / 3;
    geometry.positions.push(0, y, 0);
    geometry.normals.push(0, sign, 0);
    geometry.uvs.push(0.5, 0.5);

    const rimStart = geometry.positions.length / 3;
    for (let i = 0; i <= radialSegments; i++) {
      const angle = (i / radialSegments) * Math.PI * 2;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      geometry.positions.push(x * radius, y, z * radius);
      geometry.normals.push(0, sign, 0);
      geometry.uvs.push(x * 0.5 + 0.5, z * 0.5 + 0.5);
    }

    for (let i = 0; i < radialSegments; i++) {
      const a = rimStart + i;
      const b = rimStart + i + 1;
      if (sign < 0) geometry.indices.push(center, a, b);
      else geometry.indices.push(center, b, a);
    }
  }

  return geometry;
}

/**
 * Усечённый конус вдоль оси Y: конические ножки мебели.
 *
 * Боковая нормаль наклонена вместе с образующей, а не взята
 * горизонтальной как у цилиндра: иначе конус бликует как труба
 * и читается плоским.
 */
export function taperedCylinder(topRadiusMm, bottomRadiusMm, heightMm, radialSegments = 12) {
  const topRadius = topRadiusMm / MM;
  const bottomRadius = bottomRadiusMm / MM;
  const halfHeight = heightMm / MM / 2;
  const geometry = emptyGeometry();

  // Наклон образующей: на него заваливается нормаль боковой поверхности
  const slope = (bottomRadius - topRadius) / (halfHeight * 2);
  const scale = Math.hypot(1, slope);

  for (let iy = 0; iy <= 1; iy++) {
    const radius = iy === 0 ? bottomRadius : topRadius;
    for (let i = 0; i <= radialSegments; i++) {
      const angle = (i / radialSegments) * Math.PI * 2;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      geometry.positions.push(x * radius, iy === 0 ? -halfHeight : halfHeight, z * radius);
      geometry.normals.push(x / scale, slope / scale, z / scale);
      geometry.uvs.push(i / radialSegments, iy);
    }
  }

  const stride = radialSegments + 1;
  for (let i = 0; i < radialSegments; i++) {
    geometry.indices.push(i, i + stride, i + 1, i + 1, i + stride, i + stride + 1);
  }

  // Крышки: веер треугольников от центра
  for (const [sign, y, radius] of [
    [-1, -halfHeight, bottomRadius],
    [1, halfHeight, topRadius],
  ]) {
    const center = geometry.positions.length / 3;
    geometry.positions.push(0, y, 0);
    geometry.normals.push(0, sign, 0);
    geometry.uvs.push(0.5, 0.5);

    const rimStart = geometry.positions.length / 3;
    for (let i = 0; i <= radialSegments; i++) {
      const angle = (i / radialSegments) * Math.PI * 2;
      const x = Math.cos(angle);
      const z = Math.sin(angle);
      geometry.positions.push(x * radius, y, z * radius);
      geometry.normals.push(0, sign, 0);
      geometry.uvs.push(x * 0.5 + 0.5, z * 0.5 + 0.5);
    }

    for (let i = 0; i < radialSegments; i++) {
      const a = rimStart + i;
      const b = rimStart + i + 1;
      if (sign < 0) geometry.indices.push(center, a, b);
      else geometry.indices.push(center, b, a);
    }
  }

  return geometry;
}

/** Число треугольников — для проверки бюджета ASSET_BUDGETS. */
export function triangleCount(geometry) {
  return geometry.indices.length / 3;
}

/** Габарит в мм: пишется в products.width_mm/height_mm/depth_mm. */
export function boundsMm(geometry) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < geometry.positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], geometry.positions[i + axis]);
      max[axis] = Math.max(max[axis], geometry.positions[i + axis]);
    }
  }
  return {
    widthMm: Math.round((max[0] - min[0]) * MM),
    heightMm: Math.round((max[1] - min[1]) * MM),
    depthMm: Math.round((max[2] - min[2]) * MM),
    minYMm: Math.round(min[1] * MM),
  };
}
