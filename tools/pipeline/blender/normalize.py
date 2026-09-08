"""
Нормализация модели в Blender headless. Этапы 2-3 пайплайна (ТЗ 6.1).

Запуск:
  blender --background --python normalize.py -- --input model.fbx --output model.glb

Приводит к контракту проекта:
  - единицы: метры (в БД мм, конвертация на границе)
  - ось Y вверх
  - origin в низ-центр габарита
  - применены модификаторы, разобрана иерархия
"""
import argparse
import sys

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-dimension", type=float, default=5.0,
                        help="Санитарная проверка масштаба, метры")
    return parser.parse_args(argv)


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_model(path: str) -> None:
    lower = path.lower()
    if lower.endswith(".fbx"):
        bpy.ops.import_scene.fbx(filepath=path, global_scale=1.0)
    elif lower.endswith(".obj"):
        bpy.ops.wm.obj_import(filepath=path)
    elif lower.endswith((".glb", ".gltf")):
        bpy.ops.import_scene.gltf(filepath=path)
    else:
        raise ValueError(f"Неподдерживаемый формат: {path}")


def apply_modifiers() -> None:
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = obj
        for modifier in list(obj.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=modifier.name)
            except RuntimeError:
                # Битый модификатор не должен ронять весь пайплайн
                obj.modifiers.remove(modifier)


def normalize_transform(max_dimension: float) -> None:
    """Origin в низ-центр габарита: мебель ставится на пол без смещений."""
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise ValueError("В файле нет мешей")

    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    min_corner = Vector((float("inf"),) * 3)
    max_corner = Vector((float("-inf"),) * 3)
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            min_corner = Vector(map(min, min_corner, world))
            max_corner = Vector(map(max, max_corner, world))

    size = max_corner - min_corner
    if max(size) > max_dimension:
        # Частый случай: модель в сантиметрах или миллиметрах
        raise ValueError(
            f"Габарит {tuple(round(v, 2) for v in size)} м превышает {max_dimension} м. "
            "Вероятно, неверные единицы в исходнике — проверьте вручную."
        )

    offset = Vector((
        -(min_corner.x + max_corner.x) / 2,
        -min_corner.y,
        -(min_corner.z + max_corner.z) / 2,
    ))
    for obj in meshes:
        obj.location += offset


def export_gltf(path: str) -> None:
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_draco_mesh_compression_enable=False,  # сжимаем в optimize.mjs
    )


def main() -> None:
    args = parse_args()
    clear_scene()
    import_model(args.input)
    apply_modifiers()
    normalize_transform(args.max_dimension)
    export_gltf(args.output)
    print(f"OK: {args.output}")


if __name__ == "__main__":
    main()
