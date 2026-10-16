# Собирает config.json детальных кусков зон для build.mjs: все слои BodyParts3D (кости, мышцы, хрящи
# и связки, артерии, вены, нервы) в сфере вокруг точки зоны, по куску на точку.
# usage: python3 -I detail.py <dl dir> <obj dir> <out dir> <offset x,y,z> <ratio>
# offset -- сдвиг из лога сборки фигуры (строка bounds ... offset), чтобы кусок лёг в её координаты
import json, sys, collections, glob, os

dl, obj_dir, out_dir, offset, ratio = sys.argv[1:]
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
for p in glob.glob(f'{obj_dir}/*.obj'):
    lo, hi = [1e9] * 3, [-1e9] * 3
    with open(p) as fh:
        for line in fh:
            if line.startswith('v '):
                x, y, z = map(float, line.split()[1:4])
                v = (x / 1000 + off[0], z / 1000 + off[1], -y / 1000 + off[2])
                lo = [min(a, b) for a, b in zip(lo, v)]
                hi = [max(a, b) for a, b in zip(hi, v)]
    boxes[os.path.basename(p)[:-4]] = (lo, hi)

bones = by['bone organ'] | by['costal cartilage'] | by['intervertebral disk'] | by['articular disk of symphysis']
layers = {
    'bones': bones,
    'muscles': (by['muscle organ'] | by['tendon']) - bones,
    'cartilage': (by['cartilage organ'] | by['ligament organ']) - bones,
    'arteries': by['artery'],
    'veins': by['vein'],
    'nerves': by['nerve'] | by['nerve trunk'],
}

# Точки и радиусы -- как ANCHORS в src/frontend/scene/zones.ts; кусок берём в 1,25 радиуса
ZONES = {
    'shoulder': ((0.165, 1.39, -0.024), 0.13),
    'elbow': ((0.21, 1.127, -0.033), 0.09),
    'wrist-hand': ((0.25, 0.874, 0.021), 0.1),
    'lumbar': ((0, 1.066, -0.034), 0.15),
    'hip-groin': ((0.107, 0.882, -0.025), 0.14),
    'knee': ((0.081, 0.459, 0.011), 0.085),
    'ankle-foot': ((0.07, 0.064, -0.024), 0.09),
}


def touches(box, c, r):
    lo, hi = box
    return sum((max(lo[k] - c[k], 0, c[k] - hi[k])) ** 2 for k in range(3)) < r * r


os.makedirs(out_dir, exist_ok=True)
for zone, (c, r) in ZONES.items():
    for side, sx in ((('left', 1), ('right', -1)) if c[0] else (('center', 1),)):
        center = (c[0] * sx, c[1], c[2])
        radius = r * 1.25
        groups = []
        for name, files in layers.items():
            near = sorted(f for f in files if f in boxes and touches(boxes[f], center, radius))
            if near:
                groups.append({'name': name, 'files': near, 'ratio': ratio, 'error': 0.005})
        cfg = {'objDirs': [obj_dir], 'offset': off, 'clip': {'center': center, 'radius': radius}, 'groups': groups}
        json.dump(cfg, open(f'{out_dir}/{zone}-{side}.json', 'w'), indent=1)
        print(zone, side, {g['name']: len(g['files']) for g in groups})
