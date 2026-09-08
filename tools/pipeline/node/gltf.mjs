/**
 * Сборка glTF-документа из готовых буферов геометрии.
 *
 * Один примитив на материал: детали, слитые заранее в catalog.mjs,
 * дают ровно столько draw calls, сколько материалов у изделия. Разбиение
 * по деталям стоило бы по draw call на каждую ножку, а бюджет на них
 * жёсткий (RENDER_BUDGETS.maxDrawCalls).
 */
import { Document, NodeIO } from '@gltf-transform/core';

export function buildDocument({ name, groups, materials, textures = {} }) {
  const doc = new Document();
  doc.getRoot().getAsset().generator = 'furni-pipeline';
  const buffer = doc.createBuffer();
  const scene = doc.createScene(name);
  const mesh = doc.createMesh(name);

  const textureNodes = new Map();
  for (const [key, image] of Object.entries(textures)) {
    textureNodes.set(
      key,
      doc.createTexture(key).setImage(new Uint8Array(image)).setMimeType('image/png'),
    );
  }

  for (const group of groups) {
    const spec = materials[group.material];
    if (!spec) throw new Error(`Материал ${group.material} отсутствует в каталоге`);

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

    mesh.addPrimitive(createPrimitive(doc, buffer, group.geometry, material));
  }

  const node = doc.createNode(name).setMesh(mesh);
  scene.addChild(node);
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
