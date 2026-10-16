# Шорты для фигуры главной: оболочка вокруг кожи таза и бёдер, сглаженная, как ткань.
# Координаты -- мировые координаты сцены (метры, Y вверх), как у skin.obj из skin-obj.mjs.
#   blender -b -P scripts/model/shorts.py -- skin.obj public/model/shorts.glb
import sys

import bmesh
import bpy

skin_path, out_path = sys.argv[sys.argv.index('--') + 1 :]

# От пояса до середины бедра. Бёдра кончаются на |x| 0,175, кисти начинаются с 0,21
WAIST, HEM, HALF_WIDTH = 0.975, 0.63, 0.19
# Ткань отходит от кожи примерно на столько, мельче вокселя оболочка рвётся
OFFSET, VOXEL = 0.009, 0.004

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=skin_path, forward_axis='Y', up_axis='Z')
skin = bpy.context.selected_objects[0]

# Оставляем только кожу в границах шорт
mesh = bmesh.new()
mesh.from_mesh(skin.data)
drop = [v for v in mesh.verts if not (HEM <= v.co.y <= WAIST and abs(v.co.x) <= HALF_WIDTH)]
bmesh.ops.delete(mesh, geom=drop, context='VERTS')
mesh.to_mesh(skin.data)
mesh.free()

# Оболочка в обе стороны от кожи: после ремеша внешняя её сторона -- ткань
solidify = skin.modifiers.new('solidify', 'SOLIDIFY')
solidify.thickness = OFFSET * 2
solidify.offset = 0
bpy.context.view_layer.objects.active = skin
bpy.ops.object.modifier_apply(modifier='solidify')

# Пах: ткань идёт мостом между бёдрами и спереди почти ровно, а не обтягивает каждую складку.
# Широкий приплюснутый эллипсоид от одной тазовой кости до другой
bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, location=(0, 0.795, 0.012))
crotch = bpy.context.active_object
crotch.scale = (0.1, 0.095, 0.088)
bpy.ops.object.transform_apply(scale=True)

bpy.ops.object.select_all(action='DESELECT')
skin.select_set(True)
crotch.select_set(True)
bpy.context.view_layer.objects.active = skin
bpy.ops.object.join()
shorts = bpy.context.active_object
shorts.name = 'shorts'

remesh = shorts.modifiers.new('remesh', 'REMESH')
remesh.mode = 'VOXEL'
remesh.voxel_size = VOXEL
smooth = shorts.modifiers.new('smooth', 'SMOOTH')
smooth.factor = 0.8
smooth.iterations = 30
bpy.ops.object.modifier_apply(modifier='remesh')
bpy.ops.object.modifier_apply(modifier='smooth')

# Внутренняя сторона оболочки лежит под кожей и не видна: убираем всё, что ближе к оси ноги
# или таза, чем кожа. Проще -- оставить самый крупный внешний кусок после ремеша
mesh = bmesh.new()
mesh.from_mesh(shorts.data)
mesh.verts.ensure_lookup_table()
parts, seen = [], set()
for start in mesh.verts:
    if start.index in seen:
        continue
    stack, part = [start], []
    seen.add(start.index)
    while stack:
        v = stack.pop()
        part.append(v)
        for e in v.link_edges:
            o = e.other_vert(v)
            if o.index not in seen:
                seen.add(o.index)
                stack.append(o)
    parts.append(part)
# Внешняя поверхность -- кусок с самой дальней от центра вершиной
outer = max(parts, key=lambda part: max(abs(v.co.x) + abs(v.co.z) for v in part))
keep = {v.index for v in outer}
bmesh.ops.delete(mesh, geom=[v for v in mesh.verts if v.index not in keep], context='VERTS')
mesh.to_mesh(shorts.data)
mesh.free()

# Ровные пояс и подол: срез по горизонтали чуть внутри границ, рваный край ремеша уходит
mesh = bmesh.new()
mesh.from_mesh(shorts.data)
for y, keep_below in ((WAIST - 0.015, True), (HEM + 0.015, False)):
    geom = mesh.verts[:] + mesh.edges[:] + mesh.faces[:]
    bmesh.ops.bisect_plane(
        mesh,
        geom=geom,
        plane_co=(0, y, 0),
        plane_no=(0, 1, 0),
        clear_outer=keep_below,
        clear_inner=not keep_below,
    )
mesh.to_mesh(shorts.data)
mesh.free()

decimate = shorts.modifiers.new('decimate', 'DECIMATE')
decimate.ratio = min(1.0, 9000 / max(1, len(shorts.data.polygons)))
bpy.ops.object.modifier_apply(modifier='decimate')
bpy.ops.object.shade_smooth()

print(f'shorts: {len(shorts.data.vertices)} vertices, {len(shorts.data.polygons)} faces, {len(parts)} parts')

bpy.ops.object.select_all(action='DESELECT')
shorts.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=out_path,
    export_format='GLB',
    use_selection=True,
    export_yup=False,
    export_apply=True,
    export_materials='NONE',
    export_texcoords=False,
)
