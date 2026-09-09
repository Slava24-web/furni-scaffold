/**
 * Превью изделия для каталога.
 *
 * Рисуется здесь же, программным растеризатором по той самой геометрии,
 * из которой собирается GLB. Браузер не нужен: результат детерминирован,
 * не зависит от версии драйвера и не требует поднимать headless-хром
 * ради семнадцати картинок.
 *
 * Формат заложен в схему БД (AssetKind.thumb) и в бюджеты ассетов.
 */
import sharp from 'sharp';

/** Ракурс: три четверти сверху, как в мебельных каталогах. */
const AZIMUTH_DEG = 34;
const ELEVATION_DEG = 21;
/** Поля вокруг модели в долях кадра. */
const MARGIN = 0.08;
/** Сглаживание даётся передискретизацией: рисуем крупнее и уменьшаем. */
const SUPERSAMPLE = 3;

const LIGHT = normalize([-0.35, 0.86, 0.37]);
const AMBIENT = 0.42;

/**
 * @param {{material: string, geometry: {positions: number[], normals: number[], indices: number[]}}[]} groups
 * @param {Record<string, {baseColorFactor: number[]}>} materials
 * @param {{width?: number, height?: number}} [options]
 * @returns {Promise<Buffer>} PNG с прозрачным фоном
 */
export async function renderThumbnail(groups, materials, options = {}) {
  const width = options.width ?? 256;
  const height = options.height ?? 192;
  const w = width * SUPERSAMPLE;
  const h = height * SUPERSAMPLE;

  const pixels = Buffer.alloc(w * h * 4);
  const depth = new Float32Array(w * h).fill(-Infinity);

  const basis = viewBasis();
  const fit = fitToFrame(groups, basis, w, h);
  if (!fit) return toPng(pixels, w, h, width, height);

  for (const group of groups) {
    const colour = materials[group.material]?.baseColorFactor ?? [0.8, 0.8, 0.8, 1];
    drawGroup(group.geometry, colour, basis, fit, pixels, depth, w, h);
  }

  return toPng(pixels, w, h, width, height);
}

/** Ортонормированный базис камеры: вправо, вверх, на камеру. */
function viewBasis() {
  const az = (AZIMUTH_DEG * Math.PI) / 180;
  const el = (ELEVATION_DEG * Math.PI) / 180;

  const toCamera = normalize([Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]);
  const right = normalize(cross([0, 1, 0], toCamera));
  const up = cross(toCamera, right);
  return { right, up, toCamera };
}

/** Масштаб и сдвиг, вписывающие модель в кадр без искажения пропорций. */
function fitToFrame(groups, basis, w, h) {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (const group of groups) {
    const { positions } = group.geometry;
    for (let i = 0; i < positions.length; i += 3) {
      const point = [positions[i], positions[i + 1], positions[i + 2]];
      const u = dot(point, basis.right);
      const v = dot(point, basis.up);
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
  }

  if (!Number.isFinite(minU) || maxU === minU || maxV === minV) return null;

  const usableW = w * (1 - MARGIN * 2);
  const usableH = h * (1 - MARGIN * 2);
  const scale = Math.min(usableW / (maxU - minU), usableH / (maxV - minV));

  return {
    scale,
    offsetX: (w - (maxU - minU) * scale) / 2 - minU * scale,
    offsetY: (h - (maxV - minV) * scale) / 2 + maxV * scale,
  };
}

function drawGroup(geometry, colour, basis, fit, pixels, depth, w, h) {
  const { positions, normals, indices } = geometry;

  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [indices[i], indices[i + 1], indices[i + 2]].map((index) => ({
      point: [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]],
      normal: [normals[index * 3], normals[index * 3 + 1], normals[index * 3 + 2]],
    }));

    const faceNormal = normalize(
      triangle.reduce((sum, vertex) => [
        sum[0] + vertex.normal[0],
        sum[1] + vertex.normal[1],
        sum[2] + vertex.normal[2],
      ], [0, 0, 0]),
    );

    // Задние грани не рисуем: они всё равно перекрыты и стоят времени
    if (dot(faceNormal, basis.toCamera) <= 0) continue;

    const screen = triangle.map((vertex) => ({
      x: dot(vertex.point, basis.right) * fit.scale + fit.offsetX,
      y: fit.offsetY - dot(vertex.point, basis.up) * fit.scale,
      z: dot(vertex.point, basis.toCamera),
    }));

    const shade = AMBIENT + (1 - AMBIENT) * Math.max(0, dot(faceNormal, LIGHT));
    fillTriangle(screen, colour, shade, pixels, depth, w, h);
  }
}

function fillTriangle(screen, colour, shade, pixels, depth, w, h) {
  const [a, b, c] = screen;
  const area = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
  if (Math.abs(area) < 1e-9) return;

  const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x)));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
  const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y)));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(a.y, b.y, c.y)));

  const red = toByte(colour[0] * shade);
  const green = toByte(colour[1] * shade);
  const blue = toByte(colour[2] * shade);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      const w0 = ((b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y)) / area;
      const w1 = ((px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;

      const z = a.z * w2 + b.z * w1 + c.z * w0;
      const index = y * w + x;
      if (z <= depth[index]) continue;

      depth[index] = z;
      const offset = index * 4;
      pixels[offset] = red;
      pixels[offset + 1] = green;
      pixels[offset + 2] = blue;
      pixels[offset + 3] = 255;
    }
  }
}

function toPng(pixels, w, h, width, height) {
  return sharp(pixels, { raw: { width: w, height: h, channels: 4 } })
    .resize(width, height, { kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Линейный цвет в байт с гамма-коррекцией: иначе превью выходят тёмными. */
function toByte(value) {
  return Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, value), 1 / 2.2) * 255)));
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}
