# Собирает config.json детальных кусков зон для build.mjs: слои BodyParts3D (кости, мышцы, хрящи,
# артерии, вены) в сфере вокруг точки зоны, по куску на точку. Нервы -- отдельным куском
# `<зона>-<сторона>.nerves`, его слабые устройства не грузят.
# usage: python3 -I detail.py <dl dir> <obj dir> <out dir> <offset x,y,z> <ratio> [<z-anatomy dir>]
# z-anatomy dir -- выход z_align.py: связки, мениски, губы, капсулы и нервы поверх BP3D
# offset -- сдвиг из лога сборки фигуры (строка bounds ... offset), чтобы кусок лёг в её координаты
import json, sys, collections, glob, os, re

dl, obj_dir, out_dir, offset, ratio, *extra = sys.argv[1:]
off = [float(v) for v in offset.split(',')]
ratio = float(ratio)

by = collections.defaultdict(set)
with open(f'{dl}/isa_element_parts.txt') as fh:
    next(fh)
    for line in fh:
        cid, name, fj = line.rstrip('\n').split('\t')
        by[name].add(fj)

# Габариты элементов в координатах фигуры: метры, Y вверх, перед = +Z
boxes = {}
names = {}
for p in glob.glob(f'{obj_dir}/*.obj') + [f for d in extra for f in glob.glob(f'{d}/*.obj')]:
    lo, hi = [1e9] * 3, [-1e9] * 3
    with open(p) as fh:
        for line in fh:
            if line.startswith('# English name'):
                names[os.path.basename(p)[:-4]] = line.split(':', 1)[1].strip()
            elif line.startswith('v '):
                x, y, z = map(float, line.split()[1:4])
                v = (x / 1000 + off[0], z / 1000 + off[1], -y / 1000 + off[2])
                lo = [min(a, b) for a, b in zip(lo, v)]
                hi = [max(a, b) for a, b in zip(hi, v)]
    boxes[os.path.basename(p)[:-4]] = (lo, hi)

bones = by['bone organ'] | by['costal cartilage'] | by['intervertebral disk'] | by['articular disk of symphysis']
layers = {
    'bones': bones,
    # Мышцы целиком и их части: крупные мышцы в BP3D лежат зонами и головками (см. config.py)
    'muscles': (by['muscle organ'] | by['tendon'] | by['zone of muscle organ'] | by['head of muscle organ']) - bones,
    'cartilage': (by['cartilage organ'] | by['ligament organ']) - bones,
    'arteries': by['artery'],
    'veins': by['vein'],
}
# Из Z-Anatomy все связки, мениски, губы и капсулы, а нервы -- только те, о которых говорят статьи:
# надлопаточный и подмышечный (плечо), локтевой, лучевой и срединный (локоть, кисть), седалищный
# (задняя поверхность бедра) и латеральный кожный нерв бедра (мералгия). Сплетения целиком тяжёлые
# и забивают кадр. Нервы BP3D -- только черепные, зонам не нужны
NERVES = {f'{side} {n} nerve' for side in ('left', 'right') for n in (
    'suprascapular', 'axillary', 'ulnar', 'radial', 'median', 'sciatic', 'lateral femoral cutaneous')}
part_files = {f for f in by['cardinal organ part'] if f.endswith('M') and f in names}
layers['muscles'] |= {f for f in part_files if 'trapezius' in names[f].lower() or names[f].lower().endswith(('iliotibial tract', 'calcaneal tendon'))}
for d in extra:
    for o in json.load(open(f'{d}/manifest.json'))['objects']:
        if o['kind'] in ('ligaments', 'muscles') or o['name'] in NERVES:
            layers.setdefault(o['kind'], set()).add(o['file'])
# Кожа BP3D для обрезки слоёв Z-Anatomy: что вышло за кожу, висело бы над телом
skin = sorted(by['skin'] & boxes.keys())

# Точки и радиусы -- как ANCHORS в src/frontend/scene/zones.ts; кусок берём в 1,25 радиуса
ZONES = {
    'shoulder': ((0.165, 1.39, -0.024), 0.13),
    'elbow': ((0.21, 1.127, -0.033), 0.06),
    'wrist-hand': ((0.25, 0.874, 0.021), 0.1),
    'lumbar': ((0, 1.066, -0.034), 0.15),
    'hip-groin': ((0.107, 0.882, -0.025), 0.12),
    'knee': ((0.081, 0.459, 0.011), 0.085),
    'ankle-foot': ((0.07, 0.064, -0.024), 0.09),
}


# Вены живота в куске поясницы -- треть его веса, а травмам спины они ни к чему
SKIP = {'lumbar': {'veins'}}
# Поясница широкая: в её сфере спина, живот и таз сразу, поэтому упрощаем её вдвое сильнее
RATIO = {'lumbar': 0.5}


def part_name(name):
    """Имя мышцы без стороны -- как partName в build.mjs."""
    name = re.sub(r'\b(left|right)\b', '', name.lower())
    return re.sub(r'\s+', ' ', re.sub(r'\s+muscle$', '', name.strip())).strip()


def touches(box, c, r):
    lo, hi = box
    return sum((max(lo[k] - c[k], 0, c[k] - hi[k])) ** 2 for k in range(3)) < r * r


os.makedirs(out_dir, exist_ok=True)
# Оглавление для сцены: какие куски есть и у каких есть отдельный кусок нервов
index = {}
for zone, (c, r) in ZONES.items():
    for side, sx in ((('left', 1), ('right', -1)) if c[0] else (('center', 1),)):
        center = (c[0] * sx, c[1], c[2])
        radius = r * 1.25
        groups = []
        for name, files in layers.items():
            if name in SKIP.get(zone, ()):
                continue
            near = sorted(f for f in files if f in boxes and touches(boxes[f], center, radius))
            if near:
                # Мышцы помечаются по вершинам: номер мышцы и направление волокон (см. build.mjs)
                groups.append({'name': name, 'files': near, 'ratio': ratio * RATIO.get(zone, 1), 'error': 0.005, 'parts': name == 'muscles'})
        base = {'objDirs': [obj_dir, *extra], 'offset': off, 'clip': {'center': center, 'radius': radius},
                'skinClip': {'skin': skin[0], 'groups': ['ligaments', 'nerves']}}
        for suffix, part in (('', [g for g in groups if g['name'] != 'nerves']), ('.nerves', [g for g in groups if g['name'] == 'nerves'])):
            if part:
                json.dump({**base, 'groups': part}, open(f'{out_dir}/{zone}-{side}{suffix}.json', 'w'), indent=1)
        muscles = next((g['files'] for g in groups if g['name'] == 'muscles'), [])
        index[f'{zone}-{side}'] = {
            'nerves': any(g['name'] == 'nerves' for g in groups),
            'muscles': sorted({part_name(names.get(f, '')) for f in muscles} - {''}),
        }
        print(zone, side, {g['name']: len(g['files']) for g in groups})
json.dump(index, open(f'{out_dir}/index.json', 'w'), indent=1)
