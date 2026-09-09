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
