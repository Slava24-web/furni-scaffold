/**
 * Сборка glTF-документа из готовых буферов геометрии.
 *
 * Один примитив на материал: детали, слитые заранее в catalog.mjs,
 * дают ровно столько draw calls, сколько материалов у изделия. Разбиение
 * по деталям стоило бы по draw call на каждую ножку, а бюджет на них
 * жёсткий (RENDER_BUDGETS.maxDrawCalls).
 *
 * Исключение — ящики: каждый уезжает отдельным дочерним узлом, иначе
 * выдвинуть его во вьюере нечего. Цена известна и ограничена: по узлу
 * на ящик, а не на деталь.
 */
import { Document, NodeIO } from '@gltf-transform/core';

export function buildDocument({ name, groups, materials, textures = {}, drawers = [], doors = [] }) {
  const doc = new Document();
  doc.getRoot().getAsset().generator = 'furni-pipeline';
  const buffer = doc.createBuffer();
  const scene = doc.createScene(name);

  const textureNodes = new Map();
  for (const [key, image] of Object.entries(textures)) {
    textureNodes.set(
      key,
      doc.createTexture(key).setImage(new Uint8Array(image)).setMimeType('image/png'),
    );
  }

  // Материал общий на весь документ: копия на каждый узел множила бы
  // их число, а оно ограничено бюджетом (ASSET_BUDGETS.maxMaterialsPerAsset)
  const materialNodes = new Map();
  const materialFor = (code) => {
    const existing = materialNodes.get(code);
    if (existing) return existing;

    const spec = materials[code];
    if (!spec) throw new Error(`Материал ${code} отсутствует в каталоге`);

    const material = doc
      .createMaterial(spec.code)
      .setBaseColorFactor(spec.baseColorFactor)
      .setRoughnessFactor(spec.roughness)
      .setMetallicFactor(spec.metallic);

    if (spec.texture) {
      const texture = textureNodes.get(spec.texture);
      if (!texture) throw new Error(`Текстура ${spec.texture} не сгенерирована`);
      material.setBaseColorTexture(texture);
    }

    materialNodes.set(code, material);
    return material;
  };

  const addMesh = (meshName, meshGroups) => {
    const mesh = doc.createMesh(meshName);
    for (const group of meshGroups) {
      mesh.addPrimitive(
        createPrimitive(doc, buffer, group.geometry, materialFor(group.material)),
      );
    }
    return mesh;
  };

  const node = doc.createNode(name).setMesh(addMesh(name, groups));
  scene.addChild(node);

  for (const door of doors) {
    // Точка навески едет в узле: вокруг неё поворачивается полотно, и
    // посчитать её во вьюере по габариту нельзя — дверца ушла бы
    // сквозь боковину
    const child = doc
      .createNode(door.name)
      .setMesh(addMesh(door.name, door.groups))
      .setExtras({
        hingeXMm: door.hingeXMm,
        hingeZMm: door.hingeZMm,
        maxAngleDeg: door.maxAngleDeg,
      });
    node.addChild(child);
  }

  for (const drawer of drawers) {
    // Ход хранится в самом узле: вьюер не знает каталога, а выдвигать
    // ящик на глаз нельзя — он выедет из корпуса или не выедет вовсе
    const child = doc
      .createNode(drawer.name)
      .setMesh(addMesh(drawer.name, drawer.groups))
      .setExtras({ travelMm: drawer.travelMm });
    node.addChild(child);
  }

  doc.getRoot().setDefaultScene(scene);
  return doc;
}

function createPrimitive(doc, buffer, geometry, material) {
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(geometry.positions))
    .setBuffer(buffer);
  const normal = doc
    .createAccessor()
    .setType('VEC3')
    .setArray(new Float32Array(geometry.normals))
    .setBuffer(buffer);
  const uv = doc
    .createAccessor()
    .setType('VEC2')
    .setArray(new Float32Array(geometry.uvs))
    .setBuffer(buffer);
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setArray(new Uint32Array(geometry.indices))
    .setBuffer(buffer);

  return doc
    .createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setAttribute('TEXCOORD_0', uv)
    .setIndices(indices)
    .setMaterial(material);
}

export async function writeGlb(doc) {
  return new NodeIO().writeBinary(doc);
}
