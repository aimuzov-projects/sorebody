# Шорты для фигуры главной: готовая модель "Distance Short Men" (fersmta, CC BY 4.0,
# https://sketchfab.com/3d-models/distance-short-men-08eeac0016c24479bff8735bcbfbdc09), посаженная на фигуру.
# Берётся низкополигональная версия (short LP) с картой нормалей: на ней панели выкройки, швы и
# резинка. Цвет задаёт сцена, текстуру цвета и шероховатости не тащим.
#   blender -b -P scripts/model/shorts.py -- <scene.gltf из архива> skin.obj public/model/shorts.glb
#
# В Blender ось Z вверх, перед фигуры -- -Y. Экспорт с +Y вверх возвращает координаты сцены.
import sys

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

gltf_path, skin_path, out_path = sys.argv[sys.argv.index('--') + 1 :]

# Посадка: пояс шорт -- на высоту 1,0 м фигуры, ширина и глубина по талии, высота по
# расстоянию от пояса до промежности: у аватара модели посадка длинная, у фигуры -- короткая
WAIST = 1.0
SCALE = Vector((1.1, 1.12, 0.75))
# Зазор между кожей и тканью: где кожа ближе, ткань отодвигается наружу
CLEARANCE = 0.004
NORMAL_SIZE = 1024

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=gltf_path)
shorts = bpy.data.objects['short LP_shorts_0']

# Только шорты, в мировых координатах, без родителей
shorts.data.transform(shorts.matrix_world)
shorts.parent = None
shorts.matrix_world = Matrix.Identity(4)
for obj in list(bpy.data.objects):
    if obj is not shorts:
        bpy.data.objects.remove(obj)

top = max(v.co.z for v in shorts.data.vertices)
waist = [v.co for v in shorts.data.vertices if v.co.z > top - 0.01]
center_y = (min(w.y for w in waist) + max(w.y for w in waist)) / 2

bpy.ops.wm.obj_import(filepath=skin_path)
skin = bpy.context.selected_objects[0]
skin.data.transform(skin.matrix_world)
skin.matrix_world = Matrix.Identity(4)
body_waist = [v.co for v in skin.data.vertices if abs(v.co.z - 0.975) < 0.006 and abs(v.co.x) < 0.2]
body_y = (min(w.y for w in body_waist) + max(w.y for w in body_waist)) / 2

for v in shorts.data.vertices:
    v.co = Vector((v.co.x * SCALE.x, (v.co.y - center_y) * SCALE.y + body_y, WAIST - (top - v.co.z) * SCALE.z))

# Где кожа подошла к ткани ближе зазора, ткань отходит наружу по нормали кожи. Кожа -- двойная
# оболочка, нормаль разворачиваем от оси тела
tree = BVHTree.FromObject(skin, bpy.context.evaluated_depsgraph_get())
moved = 0
for v in shorts.data.vertices:
    hit, normal, _, _ = tree.find_nearest(v.co)
    if hit is None:
        continue
    if normal.dot(Vector((hit.x, hit.y - body_y, 0))) < 0:
        normal = -normal
    if (v.co - hit).dot(normal) < CLEARANCE:
        v.co = hit + normal * CLEARANCE
        moved += 1
bpy.data.objects.remove(skin)
shorts.data.update()

# Материал: только карта нормалей, уменьшенная; первая UV-развёртка -- её
for layer in list(shorts.data.uv_layers)[1:]:
    shorts.data.uv_layers.remove(layer)
nodes = shorts.active_material.node_tree.nodes
for node in list(nodes):
    if node.type != 'TEX_IMAGE':
        continue
    if 'normal' in node.image.name.lower():
        node.image.scale(NORMAL_SIZE, NORMAL_SIZE)
    else:
        nodes.remove(node)

print(f'shorts: {len(shorts.data.vertices)} vertices, {len(shorts.data.polygons)} faces, pushed out {moved}')

bpy.ops.object.select_all(action='DESELECT')
shorts.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_image_format='JPEG',
    export_jpeg_quality=90,
)
