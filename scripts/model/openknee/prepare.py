"""Поверхности и кадры сгибания колена Open Knee(s) из того, что скачал fetch.py.

usage: prepare.py <папка fetch.py>  ->  <папка>/knee.json + knee.bin для knee-frames.mjs

Кости в модели жёсткие оболочки: их поза в кадре -- по смещённым узлам (Кабш). Мягкие ткани --
тетраэдры: их поверхность -- грани, у которых один тетраэдр, а положения в кадре записываются
в координатах кости группы. Сцена двигает кость целиком, а морфами добавляет только деформацию.
Сетка -- из корня xplt версии 5 (FEBio 2.x): узлы и домены, у каждого домена номер материала.
"""
import json, os, struct, sys
import numpy as np
import trimesh
from scipy.spatial.transform import Rotation, Slerp

src = sys.argv[1]
buf = open(os.path.join(src, 'root.bin'), 'rb').read()
assert buf[:4] == b'BEF\0'


def chunks(pos, end):
    while pos + 8 <= end:
        cid, size = struct.unpack_from('<II', buf, pos)
        yield cid, pos + 8, size
        pos += 8 + size


def one(pos, end, cid):
    (p, s), = [(p, s) for c, p, s in chunks(pos, end) if c == cid]
    return p, s


# Сетка: материалы (имя по номеру), узлы, домены
rp, rs = one(4, len(buf), 0x01000000)
names = {}
mp, ms = one(rp, rp + rs, 0x01030000)
for c, p, s in chunks(mp, mp + ms):
    fields = {c2: (p2, s2) for c2, p2, s2 in chunks(p, p + s)}
    pid = struct.unpack_from('<I', buf, fields[0x01030002][0])[0]
    p2, s2 = fields[0x01030003]
    names[pid] = buf[p2:p2 + s2].split(b'\0')[0].decode()

gp, gs = one(rp, rp + rs, 0x01040000)
np_, ns = one(gp, gp + gs, 0x01041000)
cp, cs = one(np_, np_ + ns, 0x01041001)
X = np.frombuffer(buf, '<f4', cs // 4, cp).reshape(-1, 3).astype(np.float64)

NODES = {2: 4, 4: 3}  # TET4, TRI3; пружины (TRUSS) не нужны
elems = {}
dp, ds = one(gp, gp + gs, 0x01042000)
for c, p, s in chunks(dp, dp + ds):
    hp, hs = one(p, p + s, 0x01042101)
    hdr = {c2: p2 for c2, p2, _ in chunks(hp, hp + hs)}
    etype, pid, count = (struct.unpack_from('<I', buf, hdr[k])[0] for k in (0x01042102, 0x01042103, 0x01032104))
    if etype not in NODES:
        continue
    lp, ls = one(p, p + s, 0x01042200)
    rec = 2 + 1 + NODES[etype]  # заголовок блока (2 слова), номер элемента, узлы
    assert ls == rec * 4 * count
    elems[names[pid]] = np.frombuffer(buf, '<u4', ls // 4, lp).reshape(count, rec)[:, 3:].astype(np.int64)

frames = json.load(open(os.path.join(src, 'frames.json')))


def disp(state):
    raw = open(os.path.join(src, f'disp_{state}.raw'), 'rb').read()
    region, nbytes = struct.unpack_from('<II', raw, 0)
    return np.frombuffer(raw, '<f4', nbytes // 4, 8).reshape(-1, 3)


P = np.stack([X + disp(f['state']) for f in frames])  # (кадр, узел, 3), мм, оси снимка
F = len(frames)

BONES = {'FMB': 'femur', 'TBB': 'tibia', 'FBB': 'fibula', 'PTB': 'patella'}
# Кость, в координатах которой лежат кадры ткани. Связки между бедром и голенью -- на `mid`, на
# полпути между ними: каждый конец поворачивается относительно неё не больше чем на полугла
PARENT = {
    'FMC': 'femur', 'TBC-M': 'tibia', 'TBC-L': 'tibia', 'PTC': 'patella', 'MNS-M': 'tibia', 'MNS-L': 'tibia',
    'ACL': 'mid', 'PCL': 'mid', 'MCL': 'mid', 'LCL': 'mid', 'PTL': 'tibia', 'QAT': 'patella',
}
GROUPS = [
    # группа, кость, [(часть модели, название в _PART)]
    ('femur', 'femur', [('FMB', None)]),
    ('tibia', 'tibia', [('TBB', None)]),
    ('fibula', 'tibia', [('FBB', None)]),
    ('patella', 'patella', [('PTB', None)]),
    ('femoral-cartilage', 'femur', [('FMC', 'articular cartilage of femur')]),
    ('tibial-cartilage', 'tibia', [('TBC-M', 'medial tibial articular cartilage'), ('TBC-L', 'lateral tibial articular cartilage')]),
    ('patellar-cartilage', 'patella', [('PTC', 'articular cartilage of patella')]),
    ('menisci', 'tibia', [('MNS-M', 'medial meniscus'), ('MNS-L', 'lateral meniscus')]),
    ('cruciates', 'mid', [('ACL', 'anterior cruciate ligament'), ('PCL', 'posterior cruciate ligament')]),
    ('collaterals', 'mid', [('MCL', 'tibial collateral ligament'), ('LCL', 'fibular collateral ligament')]),
    ('patellar-ligament', 'tibia', [('PTL', 'patellar ligament')]),
    ('quadriceps-tendon', 'patella', [('QAT', 'quadriceps tendon')]),
]


def kabsch(a, b):
    ca, cb = a.mean(0), b.mean(0)
    U, _, Vt = np.linalg.svd((a - ca).T @ (b - cb))
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    R = Vt.T @ np.diag([1, 1, d]) @ U.T
    T = np.eye(4)
    T[:3, :3], T[:3, 3] = R, cb - R @ ca
    return T


def apply(T, p):
    return p @ T[:3, :3].T + T[:3, 3]


# Поза кости в кадре относительно кадра 0 (0° после натяжения связок)
pose = {}
for name, bone in BONES.items():
    ids = np.unique(elems[name])
    pose[bone] = np.stack([kabsch(P[0, ids], P[k, ids]) for k in range(F)])
    worst = max(np.abs(apply(pose[bone][k], P[0, ids]) - P[k, ids]).max() for k in range(F))
    assert worst < 1e-3, f'{name} is not rigid: {worst} mm'

mids = []
for k in range(F):
    a, b = pose['femur'][k], pose['tibia'][k]
    T = np.eye(4)
    T[:3, :3] = Slerp([0, 1], Rotation.from_matrix([a[:3, :3], b[:3, :3]]))([0.5]).as_matrix()[0]
    T[:3, 3] = (a[:3, 3] + b[:3, 3]) / 2
    mids.append(T)
pose['mid'] = np.stack(mids)

# Оси снимка: +X наружу, +Y вперёд, +Z вверх (ориентиры в ModelProperties.xml). Оси сцены -- как у
# моделей BodyParts3D сайта: +X внутрь у правого колена, +Y вверх, +Z вперёд; метры. Начало -- середина
# между ориентирами мыщелков бедра LFC и MFC
props = open(os.path.join(src, 'ModelProperties.xml')).read()
mark = lambda tag: np.array([float(v) for v in props.split(f'<{tag}>')[1].split('<')[0].split(',')])
AXES = np.array([[-1, 0, 0], [0, 0, 1], [0, 1, 0]], float)
S = np.eye(4)
S[:3, :3] = AXES / 1000
S[:3, 3] = -AXES @ ((mark('LFC') + mark('MFC')) / 2) / 1000
Sinv = np.linalg.inv(S)
# Бедро на сайте неподвижно: всё -- в системе бедра кадра 0
toFemur = np.linalg.inv(pose['femur'])


def boundary(tets):
    a, b, c, d = (X[tets[:, i]] for i in range(4))
    neg = np.einsum('ij,ij->i', np.cross(b - a, c - a), d - a) < 0
    t = tets.copy()
    t[neg, 1], t[neg, 2] = tets[neg, 2], tets[neg, 1]
    faces = np.concatenate([t[:, [1, 2, 3]], t[:, [0, 3, 2]], t[:, [0, 1, 3]], t[:, [0, 2, 1]]])
    _, inv, cnt = np.unique(np.sort(faces, 1), axis=0, return_inverse=True, return_counts=True)
    return faces[cnt[inv.ravel()] == 1]


def surface(name):
    if name in BONES:
        # У оболочек костей в модели треугольники смотрят то наружу, то внутрь
        ids, local = np.unique(elems[name], return_inverse=True)
        tm = trimesh.Trimesh(X[ids], local.reshape(-1, 3), process=False)
        trimesh.repair.fix_winding(tm)
        trimesh.repair.fix_inversion(tm, multibody=True)
        assert tm.is_watertight and tm.volume > 0, name
        return ids, np.asarray(tm.faces)
    ids, local = np.unique(boundary(elems[name]), return_inverse=True)
    return ids, local.reshape(-1, 3)


blob = bytearray()


def put(arr):
    arr = np.ascontiguousarray(arr)
    off = len(blob)
    blob.extend(arr.tobytes())
    blob.extend(b'\0' * (-len(blob) % 4))
    return [off, arr.nbytes]


groups = []
for gname, bone, sources in GROUPS:
    pos, idx, part, parts, base = [], [], [], [], 0
    for name, label in sources:
        ids, faces = surface(name)
        owner = BONES.get(name) or PARENT[name]
        # Кадры в координатах кости группы, в осях сцены
        pos.append(np.stack([apply(S @ np.linalg.inv(pose[owner][k]), P[k, ids]) for k in range(F)]))
        idx.append(faces + base)
        if label:
            parts.append(label)
            part.append(np.full(len(ids), len(parts), np.uint16))
        base += len(ids)
    pos = np.concatenate(pos, axis=1).astype(np.float32)
    move = np.linalg.norm(pos - pos[0], axis=2).max() * 1000
    print(f'{gname}: {pos.shape[1]} verts, deformation in its bone frame up to {move:.2f} mm')
    g = {
        'name': gname, 'bone': bone, 'parts': parts or None, 'verts': int(pos.shape[1]), 'frames': F,
        'rigid': bool(move < 1e-3), 'position': put(pos), 'index': put(np.concatenate(idx).astype(np.uint32)),
    }
    if parts:
        g['part'] = put(np.concatenate(part))
    groups.append(g)

poses = {
    b: [(S @ toFemur[k] @ pose[b][k] @ Sinv).T.reshape(16).tolist() for k in range(F)]  # по столбцам, как Matrix4
    for b in ['femur', 'tibia', 'patella', 'mid']
}
json.dump(
    {'angles': [f['flexion'] for f in frames], 'times': [f['time'] for f in frames], 'poses': poses, 'groups': groups},
    open(os.path.join(src, 'knee.json'), 'w'),
)
open(os.path.join(src, 'knee.bin'), 'wb').write(blob)
print('angles', [round(f['flexion'], 1) for f in frames])
