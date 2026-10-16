# Выгрузка из Z-Anatomy (Startup.blend) связок, менисков, суставных губ, капсул и нервов в OBJ:
# сетки берутся после модификаторов (Subdivision, Solidify, Hook, кривые с толщиной), в мировых
# координатах Blender. Рядом кладутся опорные кости для совмещения с BodyParts3D.
# usage: blender -b Startup.blend --python z_anatomy_export.py -- <out dir>
import bpy, json, os, re, sys

out_dir = sys.argv[sys.argv.index('--') + 1]
os.makedirs(out_dir, exist_ok=True)

KEEP = re.compile(r'ligament|menisc|labrum|articular capsule|nerve|plexus', re.I)
# Внутреннее ухо (CC BY-NC-SA) и почка (CC BY-NC) -- не берём; черепные структуры зонам не нужны
DROP = re.compile(r'cochlea|semicircular|vestibul|tympan|ossicle|stapes|incus|malleus|kidney|renal|cranial|optic|olfactory', re.I)
REFS = {'Femur', 'Patella', 'Tibia', 'Fibula', 'Humerus', 'Scapula', 'Clavicle', 'Hip bone', 'Radius', 'Ulna', 'Talus', 'Calcaneus'}

# Скрытые и исключённые коллекции depsgraph не вычисляет: модификаторы к ним бы не применились
def show(layer):
    layer.exclude = False
    layer.hide_viewport = False
    for child in layer.children:
        show(child)


show(bpy.context.view_layer.layer_collection)
for c in bpy.data.collections:
    c.hide_viewport = False
for ob in bpy.data.objects:
    ob.hide_viewport = False
    try:
        ob.hide_set(False)
    except RuntimeError:
        pass  # объект вне текущего слоя

deps = bpy.context.evaluated_depsgraph_get()
deps.update()
manifest = []

for ob in bpy.data.objects:
    if ob.type not in {'MESH', 'CURVE'}:
        continue

    base, _, side = ob.name.rpartition('.')
    # .l/.r -- сами структуры; .g/.j/.t/.i/.s -- подписи и служебные копии
    if side not in {'l', 'r'}:
        continue

    ref = base in REFS
    if not ref and (not KEEP.search(base) or DROP.search(base)):
        continue

    ev = ob.evaluated_get(deps)
    try:
        mesh = ev.to_mesh()
    except RuntimeError:
        continue
    if mesh is None or not mesh.polygons:
        ev.to_mesh_clear()
        continue

    mesh.calc_loop_triangles()
    mw = ob.matrix_world
    name = re.sub(r'[^\w.-]+', '_', ob.name)

    with open(f'{out_dir}/{name}.obj', 'w') as fh:
        fh.write(f'# English name : {ob.name}\n')
        for v in mesh.vertices:
            co = mw @ v.co
            fh.write(f'v {co.x:.6f} {co.y:.6f} {co.z:.6f}\n')
        for t in mesh.loop_triangles:
            a, b, c = t.vertices
            fh.write(f'f {a + 1} {b + 1} {c + 1}\n')

    manifest.append({'name': ob.name, 'file': name, 'ref': ref, 'tris': len(mesh.loop_triangles), 'type': ob.type,
                     'collections': [c.name for c in ob.users_collection]})
    ev.to_mesh_clear()

json.dump(manifest, open(f'{out_dir}/manifest.json', 'w'), indent=1)
print('exported', len(manifest), 'objects,', sum(m['tris'] for m in manifest), 'tris')
