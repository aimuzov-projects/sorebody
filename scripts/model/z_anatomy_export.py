# Выгружает в OBJ из Z-Anatomy (Startup.blend) связки, мениски, суставные губы,
# капсулы, нервы и мышцы, которых нет в BodyParts3D. Сетки берутся после модификаторов
# (Subdivision, Solidify, Hook, кривые с толщиной), в мировых координатах Blender.
# Рядом кладутся опорные кости для z_align.py и manifest.json.
# usage: blender -b Startup.blend --python z_anatomy_export.py -- <out dir> [--wide]
# --wide -- для 3D-моделей статей (rig.py): ещё сумки, сухожилия, апоневрозы, удерживатели, диски и мембраны,
#   суффиксы сторон вида .er/.ol и срединные структуры без суффикса. Детальные куски главной -- без него
import bpy, json, os, re, sys

args = sys.argv[sys.argv.index('--') + 1:]
out_dir = args[0]
WIDE = '--wide' in args
os.makedirs(out_dir, exist_ok=True)

KEEP = re.compile(r'ligament|menisc|labrum|articular capsule|nerve|plexus', re.I)
if WIDE:
    KEEP = re.compile(KEEP.pattern + r'|bursa|aponeurosis|tendon|retinacul|intervertebral disc|nucleus pulposus|'
                      r'interosseous membrane|thoracolumbar fascia|iliotibial tract|interpubic disc', re.I)
# Срединные структуры без суффикса стороны -- только эти: остальное без суффикса -- служебные копии
MIDLINE = re.compile(r'^(intervertebral disc|nucleus pulposus|interpubic disc)', re.I)
# Внутреннее ухо (CC BY-NC-SA) и почка (CC BY-NC) -- не берём; черепные структуры зонам не нужны
DROP = re.compile(r'cochlea|semicircular|vestibul|tympan|ossicle|stapes|incus|malleus|kidney|renal|cranial|optic|olfactory', re.I)
# Пальцы у Z-Anatomy согнуты иначе, чем у BP3D: их связки и ветви нервов висели бы в воздухе
FINGERS = re.compile(r'interphalangeal|metacarpophalangeal|digital|phalan|transverse metacarpal', re.I)
REFS = {'Femur', 'Patella', 'Tibia', 'Fibula', 'Humerus', 'Scapula', 'Clavicle', 'Hip bone', 'Radius', 'Ulna', 'Talus', 'Calcaneus'}
REFS |= {f'{b} bone' for b in ('Scaphoid', 'Lunate', 'Capitate', 'Hamate', 'Trapezium', 'Trapezoid', 'Pisiform')}
REFS |= {f'{n} metacarpal bone' for n in ('First', 'Second', 'Third', 'Fourth', 'Fifth')}
# Поясничные позвонки -- без стороны, по ним совмещается поясница
SPINE = {f'Vertebra L{i}' for i in range(1, 6)}
# Мышцы, которых в BodyParts3D нет вовсе, а статьи о них есть: широчайшая, мышцы поясницы и живота
MUSCLES = {f'{m} muscle' for m in ('Latissimus dorsi', 'Multifidus lumborum', 'Multifidus thoracis', 'Quadratus lumborum',
                                   'Internal abdominal oblique', 'Transversus abdominis', 'Rectus abdominis')}

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
    # Вторая буква суффикса (.er/.ol у связки надколенника) -- вариант той же структуры; в имени файла остаётся
    tag = side
    if ob.name in SPINE or (WIDE and '.' not in ob.name and MIDLINE.search(ob.name)):
        base, side, tag = ob.name, 'c', 'c'
    elif WIDE and len(side) == 2 and side[0] in 'eo' and side[1] in 'lr':
        side = side[1]
    # .l/.r -- сами структуры; .g/.j/.t/.i/.s -- подписи и служебные копии
    elif side not in {'l', 'r'}:
        continue

    ref = base in REFS or base in SPINE
    muscle = base in MUSCLES
    if not ref and not muscle and (not KEEP.search(base) or DROP.search(base) or FINGERS.search(base)):
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
    name = re.sub(r'[^\w.-]+', '_', f'{base}.{tag}')

    with open(f'{out_dir}/{name}.obj', 'w') as fh:
        fh.write(f'# English name : {ob.name}\n')
        for v in mesh.vertices:
            co = mw @ v.co
            fh.write(f'v {co.x:.6f} {co.y:.6f} {co.z:.6f}\n')
        for t in mesh.loop_triangles:
            a, b, c = t.vertices
            fh.write(f'f {a + 1} {b + 1} {c + 1}\n')

    manifest.append({'name': f'{base}.{side}', 'file': name, 'ref': ref, 'muscle': muscle, 'tris': len(mesh.loop_triangles), 'type': ob.type,
                     'collections': [c.name for c in ob.users_collection]})
    ev.to_mesh_clear()

json.dump(manifest, open(f'{out_dir}/manifest.json', 'w'), indent=1)
print('exported', len(manifest), 'objects,', sum(m['tris'] for m in manifest), 'tris')
