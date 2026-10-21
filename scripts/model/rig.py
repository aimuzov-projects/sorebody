# Собирает config.json для build.mjs: правое плечо для 3D-модели в статье. Каждая кость -- свой меш,
# чтобы сцена двигала их по отдельности, а build.mjs по `rig` считает центры поворота и веса мышц.
# usage: python3 -I rig.py <dl dir> <obj dir> <muscles dir> <offset x,y,z> <out.json>
# muscles dir -- выход remesh.py, offset -- тот же, что у фигуры (README, «Детальные куски зон»)
import json, sys, collections

dl, obj_dir, muscle_dir, offset, out = sys.argv[1:]

by = collections.defaultdict(set)
with open(f'{dl}/isa_element_parts.txt') as fh:
    next(fh)
    for line in fh:
        cid, name, fj = line.rstrip('\n').split('\t')
        by[name].add(fj)


def ids(*names):
    found = [sorted(by[n]) for n in names]
    empty = [n for n, f in zip(names, found) if not f]
    if empty:
        sys.exit(f"no files for: {', '.join(empty)}")
    return [f for fs in found for f in fs]


CUFF = ('right supraspinatus', 'right infraspinatus muscle', 'right teres minor', 'right subscapularis')
DELTOID = ('clavicular part of right deltoid', 'acromial part of right deltoid', 'spinal part of right deltoid')

groups = [
    {'name': 'clavicle', 'files': ids('right clavicle'), 'ratio': 0.5, 'error': 0.005},
    {'name': 'scapula', 'files': ids('right scapula'), 'ratio': 0.3, 'error': 0.005},
    {'name': 'humerus', 'files': ids('right humerus'), 'ratio': 0.4, 'error': 0.005},
    # Мышцы проходят remesh.py, как у фигуры: группы с `parts`
    {'name': 'muscles', 'files': ids(*CUFF), 'ratio': 0.25, 'error': 0.005, 'parts': True},
    {'name': 'deltoid', 'files': ids(*DELTOID), 'ratio': 0.25, 'error': 0.005, 'parts': True},
]

rig = {
    'fixed': ['clavicle', 'scapula'],
    'moving': 'humerus',
    'clavicle': 'clavicle',
    'scapula': 'scapula',
    'weighted': ['muscles', 'deltoid'],
}

json.dump({
    'objDirs': [muscle_dir, obj_dir],
    'offset': [float(x) for x in offset.split(',')],
    'groups': groups,
    'rig': rig,
}, open(out, 'w'), indent=1)
print({g['name']: len(g['files']) for g in groups})
