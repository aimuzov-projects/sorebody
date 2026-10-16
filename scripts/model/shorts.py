# Шорты для фигуры главной: свободные, как настоящие, а не оболочка в облипку.
# Координаты -- мировые координаты сцены (метры, Y вверх), как у skin.obj из skin-obj.mjs.
#   blender -b -P scripts/model/shorts.py -- skin.obj public/model/shorts.glb
#
# Форма строится по горизонтальным срезам кожи: на каждой высоте берётся выпуклая оболочка
# среза (ткань не заходит в складки) и отодвигается наружу. У пояса ткань сидит плотно, к подолу
# отходит всё дальше: штанины висят свободными трубами. Выше промежности срез один на таз и обе
# ноги, ниже -- по штанине на ногу. Тела собираются в одно воксельным ремешем, крышки у пояса и
# подола срезаются ровной плоскостью.
import math
import sys

import bmesh
import bpy

skin_path, out_path = sys.argv[sys.argv.index('--') + 1 :]

WAIST, HEM = 0.975, 0.6
# Промежность: таз со своим срезом идёт до CROTCH_LOW, штанины начинаются с CROTCH_HIGH,
# в перекрытии ремеш сшивает их в ластовицу
CROTCH_LOW, CROTCH_HIGH = 0.705, 0.745
# Бёдра кончаются на |x| 0,175, кисти начинаются с 0,21
HALF_WIDTH = 0.19
STEP, SEGMENTS = 0.005, 72
# Зазор ткани: у пояса плотно, у промежности свободнее, к подолу штанина отходит сильнее всего
GAP_WAIST, GAP_CROTCH, GAP_HEM = 0.007, 0.016, 0.034
VOXEL = 0.0035


def read_obj(path):
    points = []
    with open(path) as file:
        for line in file:
            if line.startswith('v '):
                _, x, y, z = line.split()
                points.append((float(x), float(y), float(z)))
    return points


def hull(points):
    """Выпуклая оболочка точек (x, z), против часовой стрелки."""
    points = sorted(set(points))
    if len(points) < 3:
        return points

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def ring_radii(polygon, center, segments):
    """Расстояние от центра до оболочки по `segments` равным углам."""
    radii = []
    for k in range(segments):
        angle = 2 * math.pi * k / segments
        dx, dz = math.cos(angle), math.sin(angle)
        best = 0.0
        for i in range(len(polygon)):
            ax, az = polygon[i]
            bx, bz = polygon[(i + 1) % len(polygon)]
            ex, ez = bx - ax, bz - az
            det = -dx * ez + dz * ex
            if abs(det) < 1e-12:
                continue
            rx, rz = ax - center[0], az - center[1]
            # center + t * d = a + u * e
            t = (-rx * ez + rz * ex) / det
            u = (dx * rz - dz * rx) / det
            if t > 0 and -1e-9 <= u <= 1 + 1e-9:
                best = max(best, t)
        radii.append(best)
    return radii


def smooth_circular(values, width=2):
    # Сглаживание не опускает радиус ниже исходного: иначе кожа на выступах таза проступала сквозь ткань
    n = len(values)
    return [
        max(values[i], sum(values[(i + j) % n] for j in range(-width, width + 1)) / (2 * width + 1)) for i in range(n)
    ]


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def levels(top, bottom):
    count = int(round((top - bottom) / STEP))
    return [top - i * (top - bottom) / count for i in range(count + 1)]


def build_solid(name, heights, pick, gap):
    """Тело из колец на высотах `heights` (сверху вниз). `pick(x)` -- какие точки среза брать."""
    hulls, centers = [], []
    for y in heights:
        section = [(x, z) for x, py, z in skin if abs(py - y) < STEP * 0.6 and abs(x) <= HALF_WIDTH and pick(x)]
        polygon = hull(section)
        hulls.append(polygon)
        centers.append((sum(p[0] for p in polygon) / len(polygon), sum(p[1] for p in polygon) / len(polygon)))

    # Центры колец ведём плавной линией: тогда радиусы соседних срезов сравнимы по углам
    def window(values, i, width):
        return values[max(0, i - width) : i + width + 1]

    axis = []
    for i in range(len(centers)):
        near = window(centers, i, 4)
        axis.append((sum(c[0] for c in near) / len(near), sum(c[1] for c in near) / len(near)))
    radii = [smooth_circular(ring_radii(polygon, center, SEGMENTS)) for polygon, center in zip(hulls, axis)]

    # По высоте: огибающая по соседям, затем среднее -- без ступенек и без провалов внутрь кожи
    envelope = [[max(r[k] for r in window(radii, i, 3)) for k in range(SEGMENTS)] for i in range(len(radii))]
    smoothed = []
    for i, y in enumerate(heights):
        near = window(envelope, i, 5)
        smoothed.append(
            (y, axis[i], [max(radii[i][k], sum(r[k] for r in near) / len(near)) for k in range(SEGMENTS)])
        )

    mesh = bmesh.new()
    loops = []
    for y, (cx, cz), radii in smoothed:
        offset = gap(y)
        loop = []
        for k in range(SEGMENTS):
            angle = 2 * math.pi * k / SEGMENTS
            r = radii[k] + offset
            loop.append(mesh.verts.new((cx + r * math.cos(angle), y, cz + r * math.sin(angle))))
        loops.append(loop)
    for upper, lower in zip(loops, loops[1:]):
        for k in range(SEGMENTS):
            mesh.faces.new((upper[k], upper[(k + 1) % SEGMENTS], lower[(k + 1) % SEGMENTS], lower[k]))
    mesh.faces.new(loops[0])
    mesh.faces.new(list(reversed(loops[-1])))
    bmesh.ops.recalc_face_normals(mesh, faces=mesh.faces[:])

    data = bpy.data.meshes.new(name)
    mesh.to_mesh(data)
    mesh.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    return obj


def pelvis_gap(y):
    return GAP_WAIST + (GAP_CROTCH - GAP_WAIST) * smoothstep(WAIST, CROTCH_LOW, y)


def leg_gap(y):
    return GAP_CROTCH + (GAP_HEM - GAP_CROTCH) * smoothstep(CROTCH_HIGH, HEM, y)


skin = read_obj(skin_path)

bpy.ops.wm.read_factory_settings(use_empty=True)

# Срез чуть выше пояса и ниже подола: крышки потом отрезаются ровно по WAIST и HEM
pelvis = build_solid('pelvis', levels(WAIST + 0.012, CROTCH_LOW), lambda x: True, pelvis_gap)
left = build_solid('left', levels(CROTCH_HIGH, HEM - 0.012), lambda x: x > 0.004, leg_gap)
right = build_solid('right', levels(CROTCH_HIGH, HEM - 0.012), lambda x: x < -0.004, leg_gap)

bpy.ops.object.select_all(action='DESELECT')
for obj in (pelvis, left, right):
    obj.select_set(True)
bpy.context.view_layer.objects.active = pelvis
bpy.ops.object.join()
shorts = bpy.context.active_object
shorts.name = 'shorts'

remesh = shorts.modifiers.new('remesh', 'REMESH')
remesh.mode = 'VOXEL'
remesh.voxel_size = VOXEL
smooth = shorts.modifiers.new('smooth', 'SMOOTH')
smooth.factor = 0.6
smooth.iterations = 30
decimate = shorts.modifiers.new('decimate', 'DECIMATE')
decimate.ratio = 0.2
for name in ('remesh', 'smooth', 'decimate'):
    bpy.ops.object.modifier_apply(modifier=name)

# Ровные пояс и подол: плоскость режет треугольники точно, после неё сетку уже не трогаем
mesh = bmesh.new()
mesh.from_mesh(shorts.data)
for y, keep_below in ((WAIST, True), (HEM, False)):
    bmesh.ops.bisect_plane(
        mesh,
        geom=mesh.verts[:] + mesh.edges[:] + mesh.faces[:],
        plane_co=(0, y, 0),
        plane_no=(0, 1, 0),
        clear_outer=keep_below,
        clear_inner=not keep_below,
    )
mesh.to_mesh(shorts.data)
mesh.free()
bpy.ops.object.shade_smooth()

print(f'shorts: {len(shorts.data.vertices)} vertices, {len(shorts.data.polygons)} faces')

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
