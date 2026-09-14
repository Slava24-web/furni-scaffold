/**
 * Выпуск USDZ для AR Quick Look на iOS.
 *
 * Safari не поддерживает WebXR для дополненной реальности на айфоне
 * и, судя по позиции Apple, не будет: сценарий «поставить товар в свою
 * комнату» отдан родному просмотрщику AR Quick Look. Тот принимает
 * только USDZ, поэтому рядом с GLB нужен второй файл.
 *
 * Канонический путь до USDZ — usd_from_gltf от Google поверх Pixar USD,
 * то есть Docker, питон и гигабайты зависимостей в пайплайне. Здесь он
 * не нужен: USDZExporter из состава three собирает файл сам, работает
 * в Node без DOM, а геометрия у нас и так лежит буферами.
 *
 * Ограничение честное: экспортёр покрывает PBR-материалы, но не покрывает
 * анимацию и часть расширений glTF. Для корпусной мебели этого хватает,
 * подвижные дверцы в AR не нужны — их там некому открывать.
 *
 * Разбор целиком — docs/AR.md.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  MeshStandardMaterial,
  Scene,
} from 'three';
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js';

/**
 * Материал изделия в терминах three.
 *
 * baseColorFactor у нас в линейном пространстве, как требует glTF;
 * Color.setRGB с LinearSRGBColorSpace принимает ровно его, и лишнего
 * преобразования не происходит.
 */
function materialFor(code, materials) {
  const spec = materials[code];
  const material = new MeshStandardMaterial({ name: code });

  if (!spec) return material;
  const [r, g, b] = spec.baseColorFactor;
  // Значения уже линейные — так их хранит glTF. Пространство указано
  // явно, иначе гамма применится второй раз и графит станет серым
  material.color = new Color().setRGB(r, g, b, LinearSRGBColorSpace);
  material.roughness = spec.roughness ?? 0.5;
  material.metalness = spec.metallic ?? 0;
  return material;
}

/** Сырые буферы пайплайна в геометрию three. */
function geometryFor(raw) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(raw.positions), 3));
  if (raw.normals?.length) {
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(raw.normals), 3));
  }
  if (raw.uvs?.length) {
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(raw.uvs), 2));
  }
  if (raw.indices?.length) geometry.setIndex(raw.indices);
  if (!raw.normals?.length) geometry.computeVertexNormals();
  return geometry;
}

/**
 * Сборка USDZ из групп «материал — геометрия».
 *
 * Подвижные детали сливаются с корпусом: в AR изделие показывают
 * собранным, а отдельные узлы дверец там только утяжеляют файл.
 *
 * @param {{material: string, geometry: object}[]} groups
 * @param {Record<string, object>} materials справочник материалов тенанта
 * @returns {Promise<Uint8Array>}
 */
export async function buildUsdz(groups, materials) {
  const scene = new Scene();
  const root = new Group();
  root.name = 'Product';
  scene.add(root);

  for (const group of groups) {
    const mesh = new Mesh(geometryFor(group.geometry), materialFor(group.material, materials));
    mesh.name = group.material;
    root.add(mesh);
  }

  const exporter = new USDZExporter();
  return exporter.parseAsync(scene);
}
