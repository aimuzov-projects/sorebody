# Переводит выгрузку z_anatomy_export.py в координаты OBJ BodyParts3D (мм, Z вверх, перед = -Y).
# Кости Z-Anatomy -- переделанные кости BP3D: длина и форма расходятся на 1-2 см, поэтому одного
# общего переноса мало. Для каждой зоны подгоняем ICP с масштабом по костям её сустава, а каждую
# вершину переносим смесью подгонок ближних зон: длинные мышцы и нервы не рвутся между зонами.
# usage: blender -b --factory-startup --python z_align.py -- <export dir> <bp3d obj dir> <out dir> <offset x,y,z>
# offset -- сдвиг фигуры из лога build.mjs, чтобы перевести точки зон из zones.ts в мм BP3D
import glob, json, os, sys

import numpy as np
from mathutils import kdtree

exp_dir, bp_dir, out_dir, offset = sys.argv[sys.argv.index('--') + 1:]
off = [float(v) for v in offset.split(',')]
manifest = json.load(open(f'{exp_dir}/manifest.json'))


def read_v(path):
    v = []
    with open(path) as fh:
        for line in fh:
            if line.startswith('v '):
                v.append(line.split()[1:4])
    return np.array(v, dtype=float)


bp_names = {}
for p in glob.glob(f'{bp_dir}/*.obj'):
    with open(p) as fh:
        for line in fh:
            if line.startswith('# English name'):
                bp_names[line.split(':', 1)[1].strip().lower()] = p
                break
            if line.startswith('v '):
                break

# Точки зон как в zones.ts (левая сторона, +X) и кости, по которым их совмещать
ZONES = {
    'shoulder': ((0.165, 1.39, -0.024), 0.13, ['Humerus', 'Scapula', 'Clavicle']),
    'elbow': ((0.21, 1.127, -0.033), 0.09, ['Humerus', 'Radius', 'Ulna']),
    'wrist-hand': (
        (0.25, 0.874, 0.021),
        0.1,
        ['Radius', 'Ulna', 'Scaphoid bone', 'Lunate bone', 'Capitate bone', 'Hamate bone', 'Trapezium bone',
         'Trapezoid bone', 'Pisiform bone', 'Second metacarpal bone', 'Third metacarpal bone', 'Fourth metacarpal bone'],
    ),
    'hip-groin': ((0.107, 0.882, -0.025), 0.14, ['Hip bone', 'Femur']),
    'knee': ((0.081, 0.459, 0.011), 0.085, ['Femur', 'Tibia', 'Patella', 'Fibula']),
    'ankle-foot': ((0.07, 0.064, -0.024), 0.09, ['Tibia', 'Fibula', 'Talus', 'Calcaneus']),
    # Поясница посередине: одна подгонка без стороны, по позвонкам L1-L5
    'lumbar': ((0, 1.066, -0.034), 0.15, [f'Vertebra L{i}' for i in range(1, 6)]),
}
SPINE_BP = {f'Vertebra L{i}': f'{n} lumbar vertebra' for i, n in enumerate(('first', 'second', 'third', 'fourth', 'fifth'), 1)}


def to_bp(p):
    """Точка фигуры (м, Y вверх, перед +Z) -> мм BP3D (Z вверх, перед -Y)."""
    return np.array([(p[0] - off[0]) * 1000, -(p[2] - off[2]) * 1000, (p[1] - off[1]) * 1000])


def umeyama(src, dst):
    """Подобие (масштаб, поворот, сдвиг), переводящее src в dst по МНК."""
    ms, md = src.mean(0), dst.mean(0)
    a, b = src - ms, dst - md
    u, s, vt = np.linalg.svd(b.T @ a / len(src))
    d = np.eye(3)
    d[2, 2] = np.sign(np.linalg.det(u @ vt))
    r = u @ d @ vt
    scale = np.trace(np.diag(s) @ d) / a.var(0).sum()
    return scale, r, md - scale * r @ ms


def refs(names, side):
    za = [read_v(f"{exp_dir}/{m['file']}.obj") for m in manifest if m['ref'] and m['name'] in {f'{n}.{side}' for n in names}]
    word = 'left' if side == 'l' else 'right'
    # В BP3D кости запястья без слова bone: left scaphoid
    keys = dict.fromkeys(k for n in names for k in (f'{word} {n.lower()}', f'{word} {n.lower().removesuffix(" bone")}'))
    if side == 'c':
        keys = [SPINE_BP[n] for n in names if n in SPINE_BP]
    bp = [read_v(bp_names[k]) for k in keys if k in bp_names]
    return np.vstack(za) * 1000 + glob_shift, np.vstack(bp)


# Общий сдвиг начала координат: метры -> мм и совпадение центров всех опорных костей
glob_shift = 0
all_bones = sorted({b for _, _, bones in ZONES.values() for b in bones})
za_all, bp_all = zip(*(refs(all_bones, s) for s in ('l', 'r')))
glob_shift = np.vstack(bp_all).mean(0) - np.vstack(za_all).mean(0)
print('global shift', glob_shift.round(1))


fits = []
for zone, (c, r, bones) in ZONES.items():
    for side, sx in (('l', 1), ('r', -1)) if c[0] else (('c', 0),):
        center = to_bp((c[0] * sx, c[1], c[2]))
        # Подгоняем по костям у самого сустава: дальние части (пластина лопатки) у моделей разной формы
        reach = r * 1000
        za, bp = refs(bones, side)
        bp = bp[np.linalg.norm(bp - center, axis=1) < reach]
        tree = kdtree.KDTree(len(bp))
        for i, p in enumerate(bp):
            tree.insert(p, i)
        tree.balance()
        # Старт: совпадение центров кусков костей у сустава
        near = za[np.linalg.norm(za - center, axis=1) < reach * 1.3]
        scale, rot, shift = 1.0, np.eye(3), bp.mean(0) - near.mean(0)
        for it in range(40):
            moved = scale * near @ rot.T + shift
            hits = [tree.find(p) for p in moved]
            dist = np.array([h[2] for h in hits])
            keep = dist < max(np.percentile(dist, 80), 1.0)
            scale, rot, shift = umeyama(near[keep], np.array([bp[h[1]] for h, k in zip(hits, keep) if k]))
        moved = scale * near @ rot.T + shift
        rms = float(np.sqrt(np.mean([tree.find(p)[2] ** 2 for p in moved])))
        fits.append({'zone': zone, 'side': side, 'center': center, 'scale': scale, 'rot': rot, 'shift': shift, 'rms': rms})
        print(f'{zone:11} {side} scale {scale:.4f} rms {rms:.2f} mm points {len(near)}/{len(bp)}')

os.makedirs(out_dir, exist_ok=True)
out = []
for m in manifest:
    if m['ref']:
        continue
    base, side = m['name'].rsplit('.', 1)
    v = read_v(f"{exp_dir}/{m['file']}.obj") * 1000 + glob_shift
    mid = v.mean(0)
    # Ближайшая зона той же стороны или поясница; дальше 1,6 радиуса зоны структура кускам не нужна
    fit = min((f for f in fits if f['side'] in (side, 'c')), key=lambda f: np.linalg.norm(mid - f['center']))
    zr = ZONES[fit['zone']][1] * 1000 * 1.6
    if np.min(np.linalg.norm(v - fit['center'], axis=1)) > zr:
        continue
    # Вес подгонки падает с расстоянием до центра её зоны, σ = 12 см
    near = [f for f in fits if f['side'] in (side, 'c')]
    w = np.stack([np.exp(-((np.linalg.norm(v - f['center'], axis=1) / 120) ** 2)) for f in near], 1) + 1e-12
    w /= w.sum(1, keepdims=True)
    p = sum(w[:, [i]] * (f['scale'] * v @ f['rot'].T + f['shift']) for i, f in enumerate(near))
    word = 'left' if side == 'l' else 'right'
    with open(f"{exp_dir}/{m['file']}.obj") as src, open(f"{out_dir}/{m['file']}.obj", 'w') as dst:
        dst.write(f'# English name : {word} {base.lower()}\n')
        for x, y, z in p:
            dst.write(f'v {x:.3f} {y:.3f} {z:.3f}\n')
        for line in src:
            if line.startswith('f '):
                dst.write(line)
    kind = 'muscles' if m.get('muscle') else 'nerves' if 'nerve' in base.lower() or 'plexus' in base.lower() else 'ligaments'
    out.append({'file': m['file'], 'name': f'{word} {base.lower()}', 'kind': kind, 'zone': fit['zone'], 'tris': m['tris']})

json.dump({'fits': [{k: (v.tolist() if hasattr(v, 'tolist') else v) for k, v in f.items()} for f in fits], 'objects': out},
          open(f'{out_dir}/manifest.json', 'w'), indent=1)
print('aligned', len(out), {k: sum(o['kind'] == k for o in out) for k in ('ligaments', 'nerves', 'muscles')})
