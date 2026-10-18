# Перестраивает оболочки мышц BodyParts3D через voxel remesh (Blender): исходные сетки мнутся складками,
# прорастают сами в себя и в соседей, а в сцене это рваные тёмные полосы. Воксельная оболочка гладкая
# и замкнутая, дальше её как обычно упрощает build.mjs.
# usage: blender -b --factory-startup --python remesh.py -- <obj dir> <out dir> <voxel мм> <проходы сглаживания>
#   <раздуть мм> <config.json> [...]
# Берёт файлы BP3D из групп muscles всех конфигов, готовые в out не пересчитывает. Если оболочка потеряла
# заметную часть площади (тонкий лист распался на вокселях), в out кладётся исходный файл.
import bpy, bmesh, sys, os, json, shutil

a = sys.argv[sys.argv.index('--') + 1:]
src, out, voxel, SMOOTH, GROW, configs = a[0], a[1], float(a[2]), int(a[3]), float(a[4]), a[5:]
# Доля площади, ниже которой считаем, что воксели съели лист
MIN_AREA = 0.9

files = sorted({f for c in configs for g in json.load(open(c))['groups'] if g['name'] == 'muscles'
                for f in g['files'] if os.path.exists(f'{src}/{f}.obj') and not os.path.exists(f'{out}/{f}.obj')})
os.makedirs(out, exist_ok=True)


def read(path):
    head, v, f = [], [], []
    for line in open(path):
        if line.startswith('#'):
            head.append(line)
        elif line.startswith('v '):
            v.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith('f '):
            idx = [int(t.split('/')[0]) - 1 for t in line.split()[1:]]
            for i in range(1, len(idx) - 1):
                f.append((idx[0], idx[i], idx[i + 1]))
    return head, v, f


kept = []
for i in files:
    head, v, f = read(f'{src}/{i}.obj')
    me = bpy.data.meshes.new(i)
    me.from_pydata(v, [], f)
    me.validate()
    ob = bpy.data.objects.new(i, me)
    bpy.context.scene.collection.objects.link(ob)
    area = sum(p.area for p in me.polygons)
    # Воксель в миллиметрах, как координаты OBJ
    me.remesh_voxel_size = voxel
    with bpy.context.temp_override(object=ob, active_object=ob):
        bpy.ops.object.voxel_remesh()
    # Площадь сверяем до сглаживания: оно и так снимает морщины исходной сетки
    ratio = sum(p.area for p in ob.data.polygons) / area
    # Ступеньки вокселей сглаживаем: meshopt иначе режет на них зарубки
    if SMOOTH:
        m = ob.modifiers.new('s', 'SMOOTH')
        m.factor = 0.5
        m.iterations = SMOOTH
        with bpy.context.temp_override(object=ob, active_object=ob):
            bpy.ops.object.modifier_apply(modifier='s')
    # Сглаживание поджимает мышцы, и в щелях между ними светит кость: возвращаем толщину по нормалям
    if GROW:
        m = ob.modifiers.new('g', 'DISPLACE')
        m.strength = GROW
        m.mid_level = 0
        with bpy.context.temp_override(object=ob, active_object=ob):
            bpy.ops.object.modifier_apply(modifier='g')
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    if ratio < MIN_AREA:
        shutil.copy(f'{src}/{i}.obj', f'{out}/{i}.obj')
        name = next((h.split(':', 1)[1].strip() for h in head if h.startswith('# English name')), '')
        kept.append(f'{i} {name} {ratio:.2f}')
    else:
        with open(f'{out}/{i}.obj', 'w') as fh:
            fh.writelines(head)
            fh.write(''.join(f'v {x:.4f} {y:.4f} {z:.4f}\n' for x, y, z in (p.co for p in me.vertices)))
            fh.write(''.join(f'f {p.vertices[0] + 1} {p.vertices[1] + 1} {p.vertices[2] + 1}\n' for p in me.polygons))
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)

print('remeshed', len(files) - len(kept), 'kept as is', len(kept))
for k in kept:
    print('  kept', k)
