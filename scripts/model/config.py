# Собирает config.json для build.mjs из списков элементов BodyParts3D (IS-A дерево).
# usage: python3 -I config.py <dl dir> <obj dir> <out.json> <muscle ratio> <bone ratio> [--skin] [--muscles <dir>]
# --muscles -- выход remesh.py: оттуда build.mjs берёт мышцы, остальное из obj dir
import json, sys, collections, glob

dl, obj_dir, out, m_ratio, b_ratio, *flags = sys.argv[1:]
muscle_dirs = [flags[flags.index('--muscles') + 1]] if '--muscles' in flags else []

by = collections.defaultdict(set)
with open(f'{dl}/isa_element_parts.txt') as fh:
    next(fh)
    for line in fh:
        cid, name, fj = line.rstrip('\n').split('\t')
        by[name].add(fj)

names = {}
for p in glob.glob(f'{obj_dir}/*.obj'):
    fj = p.rsplit('/', 1)[1][:-4]
    with open(p) as fh:
        for line in fh:
            if line.startswith('# English name'):
                names[fj] = line.split(':', 1)[1].strip().lower()
                break
            if line.startswith('v '):
                break

bones = by['bone organ'] | by['costal cartilage'] | by['intervertebral disk'] | by['articular disk of symphysis']
# Крупные мышцы в BP3D лежат частями: дельтовидная и большая грудная -- "zone of muscle organ",
# четырёхглавая, двуглавые и икроножная -- "head of muscle organ", трапециевидная -- просто части
PARTS = {f for f in by['cardinal organ part'] if f.endswith('M')}
muscles = (by['muscle organ'] | by['tendon'] | by['zone of muscle organ'] | by['head of muscle organ']) - bones
# Внутри головы мышцы глаза и языка не видны, но съедают треугольники
muscles = {f for f in muscles if not any(k in names.get(f, '') for k in ('ocul', 'rectus of eye', 'oblique of eye', 'tongue', 'glossus', 'palat', 'levator palpebrae', 'tensor tympani', 'stapedius'))}
bones = {f for f in bones if f in names}
muscles |= {f for f in PARTS if 'trapezius' in names.get(f, '') or names.get(f, '').endswith(('iliotibial tract', 'calcaneal tendon'))}
muscles = {f for f in muscles if f in names}


def ids(pattern):
    return sorted(f for f, n in names.items() if n == pattern)


# Якоря: (зона, сторона, файлы, режим) — режим top/bottom берёт полосу вершин у края кости по высоте
anchors = []
for side, sx in (('right', -1), ('left', 1)):
    anchors += [
        {'zone': 'shoulder', 'side': side, 'files': ids(f'{side} humerus'), 'mode': 'top', 'band': 0.05},
        {'zone': 'elbow', 'side': side, 'files': ids(f'{side} humerus'), 'mode': 'bottom', 'band': 0.04},
        {'zone': 'wrist-hand', 'side': side, 'files': ids(f'{side} capitate') + ids(f'{side} lunate') + ids(f'{side} hamate'), 'mode': 'center'},
        {'zone': 'hip-groin', 'side': side, 'files': ids(f'{side} femur'), 'mode': 'top', 'band': 0.06},
        {'zone': 'knee', 'side': side, 'files': ids(f'{side} patella'), 'mode': 'center'},
        {'zone': 'ankle-foot', 'side': side, 'files': ids(f'{side} talus'), 'mode': 'center'},
    ]
anchors.append({'zone': 'lumbar', 'side': 'center', 'files': [f for n in ('first', 'second', 'third', 'fourth', 'fifth') for f in ids(f'{n} lumbar vertebra')], 'mode': 'center'})
for a in anchors:
    if not a['files']:
        print('NO FILES for anchor', a['zone'], a['side'])

groups = [
    {'name': 'bones', 'files': sorted(bones), 'ratio': float(b_ratio), 'error': 0.01},
    # Номер мышцы и волокна по вершинам (build.mjs): мышцы фигуры видны в проёме до догрузки куска
    {'name': 'muscles', 'files': sorted(muscles), 'ratio': float(m_ratio), 'error': 0.01, 'parts': True},
]
if '--skin' in flags:
    groups.append({'name': 'skin', 'files': sorted(by['skin'] & set(names)), 'ratio': 0.3, 'error': 0.01})

json.dump({'objDirs': [*muscle_dirs, obj_dir], 'groups': groups, 'anchors': anchors}, open(out, 'w'), indent=1)
print({g['name']: len(g['files']) for g in groups})
