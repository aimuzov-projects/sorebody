# Делает кожу BodyParts3D бесполой: BP3D -- мужское тело, а фигуре главной пол ни к чему. Пах
# пересобирается объёмом, как у манекена, а соски закрываются заплатками.
# usage: blender -b --factory-startup --python neutral.py -- <obj dir> <out dir> <offset x,y,z> <config.json>
# Берёт файлы кожи из группы skin конфига. offset -- сдвиг фигуры из лога build.mjs: всё ниже задано
# в её координатах (метры, Y вверх, перед = +Z), как точки зон в zones.ts
import bpy, bmesh, sys, os, json

import numpy as np
import openvdb as vdb
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

src, out, offset, config = sys.argv[sys.argv.index('--') + 1:]
off = [float(v) for v in offset.split(',')]

# Пах. Кожа между SLAB по высоте заменяется: тело в этой полосе переводится в поле расстояний (SDF), из
# него плавно вычитаются гениталии и щель между бёдрами, поле размывается у промежности и заново
# обтягивается сеткой, а она сшивается с кожей по краям полосы. Шире таза полоса ничего не захватывает:
# руки начинаются дальше 0,19 по X
SLAB = (0.58, 0.96)
# Гениталии: внутри эллипса на виде спереди всё, что впереди изогнутой поверхности от лобка к вершине
# щели (`surface`: глубина на средней линии, вогнутость кривой и как она загибается вперёд к бокам), и
# ниже промежности то, что висит перед бёдрами, и корень мошонки у вершины щели
GENITALS = {'center': (0, 0.82), 'radius': (0.045, 0.055), 'floor': 0.79,
            'surface': ((0.79, 0.025), (0.875, 0.07), 1.6, 6.0), 'hang': (0.03, (0.74, 0.79), 0.035),
            'root': (0.012, (0.74, 0.805), -0.01)}
# Щель между бёдрами: в BP3D они прижаты друг к другу почти до промежности. Щель идёт насквозь спереди
# назад от вершины `top` до `bottom`, ширина по высоте -- `half`: книзу щель расширяется и сходит в настоящий просвет между ногами.
# Вырезается после размытия, иначе размытие её снова заливает. Мышцы у щели кожа обтягивает с запасом
# `cover`, чтобы щель их не оголила
GAP = {'half': {0.805: 0.005, 0.73: 0.011, 0.62: 0.003}, 'top': 0.805, 'rise': 0.0, 'bottom': 0.62,
       'cover': 0.0025}
THIGH = ('adductor', 'gracilis', 'pectineus', 'semimembranosus', 'semitendinosus', 'biceps femoris', 'vastus',
         'sartorius', 'rectus femoris')
# Радиусы скругления вычитаний и размытие поля: полностью внутри эллипсоида вокруг промежности,
# к его двойному размеру сходит на нет
ROUND = {'genitals': 0.02, 'gap': 0.02}
BLUR = {'center': (0, 0.8, 0.01), 'radius': (0.055, 0.09, 0.12), 'voxels': 8}
ARCH = {'center': (0, 0.81, -0.04), 'radius': (0.02, 0.02, 0.03), 'voxels': 6}
VOXEL = 1.0
# Толщина кожи BP3D между её слоями, мм
THICK = 2.0
# Соски -- круг на виде спереди, кожа груди перед ним; точки сняты по рендеру кожи BP3D
NIPPLES = [((-0.107, 1.277), 0.014), ((0.103, 1.278), 0.014)]


def to_figure(co):
    return (co[0] / 1000 + off[0], co[2] / 1000 + off[1], -co[1] / 1000 + off[2])


def src_y(y):
    return (y - off[1]) * 1000


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


def loops(bm):
    """Края дыр: замкнутые цепочки вершин по граничным рёбрам."""
    left = {e for e in bm.edges if e.is_boundary}
    found = []
    while left:
        e = left.pop()
        chain = [e.verts[0], e.verts[1]]
        while True:
            nxt = next((e for e in chain[-1].link_edges if e in left), None)
            if nxt is None:
                break
            left.discard(nxt)
            v = nxt.other_vert(chain[-1])
            if v == chain[0]:
                break
            chain.append(v)
        found.append(chain)
    return found


def islands(bm):
    """Связные куски сетки, каждый -- список вершин."""
    seen, parts = set(), []
    for start in bm.verts:
        if start in seen:
            continue
        part, stack = [], [start]
        seen.add(start)
        while stack:
            v = stack.pop()
            part.append(v)
            for e in v.link_edges:
                n = e.other_vert(v)
                if n not in seen:
                    seen.add(n)
                    stack.append(n)
        parts.append(part)
    return parts


def biharmonic(free, edge):
    """Ставит `free` так, чтобы Laplacian заплатки и края `edge` был минимален: заплатка продолжает
    не только край кожи, но и её наклон."""
    at = {v: i for i, v in enumerate(free)}
    rows = list(dict.fromkeys([*free, *edge]))
    a = np.zeros((len(rows), len(free)))
    b = np.zeros((len(rows), 3))
    for r, v in enumerate(rows):
        nb = [e.other_vert(v) for e in v.link_edges]
        for n, w in [*((n, 1 / len(nb)) for n in nb), (v, -1)]:
            if n in at:
                a[r, at[n]] += w
            else:
                b[r] += w * np.array(n.co[:])
    co = np.linalg.lstsq(a, -b, rcond=None)[0]
    for v in free:
        v.co = co[at[v]]


def fill(bm, chain, step):
    """Закрывает дыру соска сеткой с ребром около `step`: край проецируется на фронтальную плоскость,
    внутри ставятся точки сеткой, и всё сшивает Delaunay с краем как ограничением."""
    rim = [Vector((v.co.x, v.co.z)) for v in chain]
    # Delaunay ждёт обход против часовой
    if sum(a.x * b.y - b.x * a.y for a, b in zip(rim, rim[1:] + rim[:1])) < 0:
        chain, rim = chain[::-1], rim[::-1]
    poly = np.array([p[:] for p in rim])
    lo, hi = poly.min(0), poly.max(0)
    xs, ys = np.meshgrid(np.arange(lo[0], hi[0], step), np.arange(lo[1], hi[1], step * 0.866))
    xs = xs + (np.arange(xs.shape[0])[:, None] % 2) * step / 2
    pts = np.c_[xs.ravel(), ys.ravel()]
    # Точка внутри многоугольника (чётность пересечений) и не ближе полшага к краю
    a, b = poly, np.roll(poly, -1, 0)
    cross = ((a[:, 1] > pts[:, None, 1]) != (b[:, 1] > pts[:, None, 1])) & (
        pts[:, None, 0] < a[:, 0] + (pts[:, None, 1] - a[:, 1]) * (b[:, 0] - a[:, 0]) / (b[:, 1] - a[:, 1] + 1e-12))
    pts = pts[cross.sum(1) % 2 == 1]
    seg = b - a
    t = np.clip(((pts[:, None] - a) * seg).sum(2) / (seg * seg).sum(1), 0, 1)
    pts = pts[np.linalg.norm(pts[:, None] - (a + t[..., None] * seg), axis=2).min(1) > step / 2]
    n = len(rim)
    _, _, faces, orig, _, _ = delaunay_2d_cdt([*rim, *(Vector(p) for p in pts)], [], [list(range(n))], 1, step * 1e-3)
    centre = sum((v.co for v in chain), Vector()) / n
    verts = [chain[next(k for k in o if k < n)] if any(k < n for k in o) else bm.verts.new(centre) for o in orig]
    for f in faces:
        try:
            bm.faces.new([verts[k] for k in f])
        except ValueError:
            pass
    return [v for v in verts if not any(v == c for c in chain)]


def nipple(bm, center, radius):
    (cx, cy) = center
    cut = [v for v in bm.verts if (p := to_figure(v.co))[2] > 0 and (p[0] - cx) ** 2 + (p[1] - cy) ** 2 <= radius ** 2]
    step = float(np.median([e.calc_length() for v in cut for e in v.link_edges]))
    bmesh.ops.delete(bm, geom=cut, context='VERTS')
    # Разрез по вершинам оставляет зубцы -- треугольники, торчащие в дыру двумя краями, -- и обрывки
    for _ in range(20):
        teeth = {f for f in bm.faces if sum(e.is_boundary for e in f.edges) >= 2}
        teeth |= {f for v in bm.verts if sum(e.is_boundary for e in v.link_edges) > 2 for f in v.link_faces}
        if not teeth:
            break
        bmesh.ops.delete(bm, geom=list(teeth), context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    for chain in loops(bm):
        biharmonic(fill(bm, chain, step), chain)


def split(bm):
    """Вырезает из кожи полосу паха между SLAB и возвращает её. Обе части режутся ровно по плоскостям."""
    lo, hi = src_y(SLAB[0]), src_y(SLAB[1])
    slab = bm.copy()
    for b in (bm, slab):
        for y in (lo, hi):
            bmesh.ops.bisect_plane(b, geom=b.verts[:] + b.edges[:] + b.faces[:], plane_co=(0, 0, y), plane_no=(0, 0, 1))
    eps = 1e-4
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if lo + eps < v.co.z < hi - eps
                                and abs(to_figure(v.co)[0]) < 0.19], context='VERTS')
    bmesh.ops.delete(slab, geom=[v for v in slab.verts if not lo - eps < v.co.z < hi + eps
                                  or abs(to_figure(v.co)[0]) >= 0.19], context='VERTS')
    # Кожа BP3D -- оболочка из двух слоёв в паре миллиметров друг от друга. Объём паха строим по
    # наружному: у него самые большие габариты
    parts = islands(slab)
    keep = max(parts, key=lambda p: np.ptp([v.co[:] for v in p], axis=0).prod())
    bmesh.ops.delete(slab, geom=[v for p in parts if p is not keep for v in p], context='VERTS')
    bmesh.ops.holes_fill(slab, edges=[e for e in slab.edges if e.is_boundary], sides=0)
    bmesh.ops.triangulate(slab, faces=slab.faces)
    return slab


def smooth_cut(body, cut, k):
    """Вычитание `cut` из `body` со скруглением радиуса `k` там, где они встречаются."""
    h = np.clip(0.5 - 0.5 * (body + cut) / k, 0, 1)
    return body * (1 - h) - cut * h + k * h * (1 - h)


def blur(a, r):
    """Три прохода скользящего среднего по каждой оси -- почти гауссово размытие."""
    for axis in range(3):
        for _ in range(3):
            pad = np.concatenate([np.repeat(a.take([0], axis), r, axis), a, np.repeat(a.take([-1], axis), r, axis)], axis)
            c = np.cumsum(pad, axis, dtype=np.float64)
            c = np.concatenate([np.zeros_like(c.take([0], axis)), c], axis)
            n = a.shape[axis]
            a = ((c.take(range(2 * r + 1, 2 * r + 1 + n), axis) - c.take(range(0, n), axis)) / (2 * r + 1)).astype(np.float32)
    return a


def sdf(slab):
    """Поле расстояний полосы с вычтенными гениталиями и щелью, в мм BP3D: внутри тела меньше нуля."""
    pts = np.array([v.co[:] for v in slab.verts], np.float32)
    slab.verts.index_update()
    tris = np.array([[v.index for v in f.verts] for f in slab.faces], np.uint32)
    band = 30
    xf = vdb.createLinearTransform(VOXEL)
    grid = vdb.FloatGrid.createLevelSetFromPolygons(pts, tris, None, xf, band, band)
    lo = np.floor(pts.min(0) / VOXEL).astype(int) - 4
    hi = np.ceil(pts.max(0) / VOXEL).astype(int) + 4
    field = np.zeros(hi - lo, np.float32)
    grid.copyToArray(field, ijk=tuple(int(c) for c in lo))
    # Координаты вокселей в фигуре, метры
    i, j, k = [np.arange(n) for n in field.shape]
    sx, sy, sz = ((i + lo[0]) * VOXEL)[:, None, None], ((j + lo[1]) * VOXEL)[None, :, None], ((k + lo[2]) * VOXEL)[None, None, :]
    x, y, z = sx / 1000 + off[0], sz / 1000 + off[1], -sy / 1000 + off[2]
    g = GENITALS
    (cx, cy), (rx, ry) = g['center'], g['radius']
    (y0, z0), (y1, z1), power, bend = g['surface']
    t = np.clip((y1 - y) / (y1 - y0), 0, 1)
    # Расстояние до поверхности по глубине: она пологая, этого хватает для гладкого вычитания. Выше
    # лобка поверхность идёт дальше вверх-вперёд, как кожа живота, иначе край эллипса подрезал бы лобок
    surface = z1 - (z1 - z0) * t ** power + 0.4 * np.maximum(y - y1, 0) + bend * x ** 2 - z
    ellipse = (np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) - 1) * min(rx, ry)
    front = np.maximum(np.maximum(ellipse, g['floor'] - y), surface)
    box = [np.maximum(np.maximum(np.abs(x) - bx, np.maximum(by0 - y, y - by1)), bz - z)
           for bx, (by0, by1), bz in (g['hang'], g['root'])]
    genitals = np.minimum(front, np.minimum(*box)) * 1000
    field = smooth_cut(field, genitals, ROUND['genitals'] * 1000)
    c, r = BLUR['center'], BLUR['radius']
    d = np.sqrt(((x - c[0]) / r[0]) ** 2 + ((y - c[1]) / r[1]) ** 2 + ((z - c[2]) / r[2]) ** 2)
    w = np.clip(2 - d, 0, 1)
    w = w * w * (3 - 2 * w)
    field = field * (1 - w) + blur(field, BLUR['voxels']) * w
    top, bottom = GAP['top'], GAP['bottom']
    half = np.interp(y, *zip(*sorted(GAP['half'].items()))).astype(np.float32)
    # Сзади вершина поднимается в межъягодичную складку: иначе между ними осталась бы тонкая плёнка
    rise = np.clip((-0.02 - z) / 0.04, 0, 1) * GAP['rise']
    gap = np.maximum(np.maximum(np.abs(x) - half, y - top - rise), bottom - y) * 1000
    field = smooth_cut(field, np.broadcast_to(gap, field.shape), ROUND['gap'] * 1000)
    # Стенки щели плоские, лёгкое размытие у неё скругляет их в бёдра. Ниже 0,66 щель узкая, там
    # размытие и запас над мышцами сходят на нет, иначе на шве с бедром вышел бы уступ
    fade = np.clip(1 - (np.abs(x) - 0.02) / 0.03, 0, 1) * (y < top + 0.02) * np.clip((y - 0.66) / 0.04, 0, 1)
    field = field * (1 - fade) + blur(field, 3) * fade
    # Сзади между вершиной щели и ягодичной складкой остаётся бугорок промежности: размываем его в арку
    c, r = ARCH['center'], ARCH['radius']
    d = np.sqrt(((x - c[0]) / r[0]) ** 2 + ((y - c[1]) / r[1]) ** 2 + ((z - c[2]) / r[2]) ** 2)
    arch = np.clip(2 - d, 0, 1)
    arch = arch * arch * (3 - 2 * arch)
    field = field * (1 - arch) + blur(field, ARCH['voxels']) * arch
    # Мышцы с запасом: плавное объединение только у щели, в остальном кожа BP3D как была
    cover = np.broadcast_to(muscles(lo, field.shape, xf), field.shape) - GAP['cover'] * 1000
    k = 3.0
    h = np.clip(0.5 + 0.5 * (cover - field) / k, 0, 1)
    field = field * (1 - fade) + (field * h + cover * (1 - h) - k * h * (1 - h)) * fade
    out_grid = vdb.FloatGrid(band * VOXEL)
    out_grid.transform = xf
    out_grid.copyFromArray(np.ascontiguousarray(field, np.float32), ijk=tuple(int(c) for c in lo))
    return out_grid


def muscles(lo, shape, xf):
    """Поле расстояний мышц бедра на той же сетке, что и поле полосы. Мышцы тазового дна не берём:
    щель проходит сквозь промежность, и они легли бы поверх неё полкой."""
    pts, tris = [], []
    for f in MUSCLES:
        path = next(p for d in DIRS if os.path.exists(p := f'{d}/{f}.obj'))
        head, v, t = read(path)
        name = next((h.split(':', 1)[1].lower() for h in head if h.startswith('# English name')), '')
        if not any(k in name for k in THIGH):
            continue
        v = np.array(v, np.float32)
        if not (v[:, 2].max() > src_y(SLAB[0]) and v[:, 2].min() < src_y(SLAB[1])):
            continue
        tris.append(np.array(t, np.uint32) + sum(len(p) for p in pts))
        pts.append(v)
    grid = vdb.FloatGrid.createLevelSetFromPolygons(np.concatenate(pts), np.concatenate(tris), None, xf, 10, 10)
    field = np.zeros(shape, np.float32)
    grid.copyToArray(field, ijk=tuple(int(c) for c in lo))
    return field


def obj(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def rim_edges(chain):
    return [e for i, v in enumerate(chain) for e in v.link_edges if e.is_boundary and e.other_vert(v) == chain[i - 1]]


def extent(chain):
    return np.ptp([v.co[:] for v in chain], axis=0)[:2].prod()


def groin(bm):
    slab = split(bm)
    faces = len(slab.faces)
    field = sdf(slab)
    slab.free()
    new = bmesh.new()
    # Оба слоя оболочки: наружный и внутренний на толщину кожи глубже. На двух слоях держится и
    # skin-test.mjs, которым build.mjs обрезает слои Z-Anatomy
    for level in (0, -THICK):
        pts, tris, quads = field.convertToPolygons(level, 0)
        verts = [new.verts.new(p) for p in pts]
        for f in [*tris, *quads]:
            try:
                new.faces.new([verts[k] for k in f])
            except ValueError:
                pass
    bmesh.ops.triangulate(new, faces=new.faces)
    # Крышки полосы скруглены: отрезаем их чуть внутри и сшиваем с кожей мостиком
    lo, hi = src_y(SLAB[0]) + 3, src_y(SLAB[1]) - 3
    for y, side in ((lo, 'clear_inner'), (hi, 'clear_outer')):
        bmesh.ops.bisect_plane(new, geom=new.verts[:] + new.edges[:] + new.faces[:], plane_co=(0, 0, y),
                               plane_no=(0, 0, 1), **{side: True})
    body = obj(new, 'slab')
    new.free()
    # Плотность -- как у кожи, которую полоса заменила
    m = body.modifiers.new('d', 'DECIMATE')
    m.ratio = min(1, 2 * faces / len(body.data.polygons))
    with bpy.context.temp_override(object=body, active_object=body):
        bpy.ops.object.modifier_apply(modifier=m.name)
    bm.from_mesh(body.data)
    bpy.data.objects.remove(body)
    groups = {}
    for chain in loops(bm):
        x, y, _ = to_figure(sum((v.co for v in chain), Vector()) / len(chain))
        level = 'top' if y > (SLAB[0] + SLAB[1]) / 2 else ('left' if x > 0 else 'right')
        groups.setdefault(level, []).append(chain)
    # В каждой группе по два края у кожи и у новой сетки: внутренний слой сшивается с внутренним,
    # наружный с наружным. Ссылки Python на рёбра не переживают операций bmesh, поэтому края метим слоем
    tag = bm.edges.layers.int.new('rim')
    for n, (level, chains) in enumerate(groups.items()):
        plane = src_y(SLAB[level == 'top'])
        old = sorted((c for c in chains if abs(plane - c[0].co.z) < 0.01), key=extent)
        fresh = sorted((c for c in chains if abs(plane - c[0].co.z) >= 0.01), key=extent)
        if len(old) != 2 or len(fresh) != 2:
            sys.exit(f'groin {level}: {len(old)} skin rims, {len(fresh)} new rims')
        for layer in range(2):
            for chain in (old[layer], fresh[layer]):
                for e in rim_edges(chain):
                    e[tag] = n * 10 + layer + 1
    for n in range(len(groups)):
        for layer in (1, 2):
            bmesh.ops.bridge_loops(bm, edges=[e for e in bm.edges if e[tag] == n * 10 + layer])
    bm.edges.layers.int.remove(tag)


def front_face(bm):
    bm.normal_update()
    return min(bm.faces, key=lambda f: f.calc_center_median().y)


cfg = json.load(open(config))
skins = sorted({f for g in cfg['groups'] if g['name'] == 'skin' for f in g['files']})
# Мышцы ищутся там же, где их возьмёт build.mjs: воксельные из remesh.py раньше исходных
MUSCLES = [f for g in cfg['groups'] if g['name'] == 'muscles' for f in g['files']]
DIRS = [d for d in cfg['objDirs'] if os.path.abspath(d) != os.path.abspath(out)]
os.makedirs(out, exist_ok=True)
for i in skins:
    head, v, f = read(f'{src}/{i}.obj')
    bm = bmesh.new()
    verts = [bm.verts.new(co) for co in v]
    for t in f:
        try:
            bm.faces.new([verts[k] for k in t])
        except ValueError:
            pass
    # Половины кожи BP3D лежат отдельно и сходятся по средней линии
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
    # Нормали BP3D смотрят внутрь тела: у самой передней грани (перед -- это -Y) нормаль назад
    inward = front_face(bm).normal.y > 0
    for center, radius in NIPPLES:
        nipple(bm, center, radius)
    groin(bm)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    # Обход новых граней случайный: выравниваем все и возвращаем ориентацию исходника
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if (front_face(bm).normal.y > 0) != inward:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    print(i, 'open edges', sum(e.is_boundary for e in bm.edges))
    bm.verts.index_update()
    with open(f'{out}/{i}.obj', 'w') as fh:
        fh.writelines(head)
        fh.write(''.join(f'v {x:.4f} {y:.4f} {z:.4f}\n' for x, y, z in (p.co for p in bm.verts)))
        fh.write(''.join(f'f {p.verts[0].index + 1} {p.verts[1].index + 1} {p.verts[2].index + 1}\n' for p in bm.faces))
    bm.free()
