# Собирает config.json для build.mjs по описателю 3D-модели статьи (rigs/<name>.json, см. README).
# Каждая кость -- свой меш, чтобы сцена двигала их по отдельности; build.mjs по `rig` считает центры
# суставов и веса мышц.
# usage: python3 -I rig.py <dl dir> <obj dir> <muscles dir> <za-aligned dir | -> <rigs/name.json> <out.json>
# muscles dir -- выход remesh.py; za-aligned -- выход z_align.py, нужен, если в описателе есть `za`
import json, re, sys, collections

dl, obj_dir, muscle_dir, za_dir, desc_path, out = sys.argv[1:]
desc = json.load(open(desc_path))

by = collections.defaultdict(set)
with open(f'{dl}/isa_element_parts.txt') as fh:
    next(fh)
    for line in fh:
        cid, name, fj = line.rstrip('\n').split('\t')
        by[name].add(fj)

za = json.load(open(f'{za_dir}/manifest.json'))['objects'] if za_dir != '-' else []


def bp3d(names):
    found = [sorted(by[n]) for n in names]
    empty = [n for n, f in zip(names, found) if not f]
    if empty:
        sys.exit(f"no BodyParts3D files for: {', '.join(empty)}")
    return [f for fs in found for f in fs]


def za_files(patterns):
    # Имена Z-Anatomy в манифесте выравнивания -- в стиле BP3D: "right glenoid labrum". У части структур
    # по два варианта с одним именем (.er/.or у связки надколенника): берём подробный, иначе они
    # легли бы друг на друга
    best = {}
    for pattern in patterns:
        hit = [o for o in za if re.search(pattern, o['name'])]
        if not hit:
            sys.exit(f'no Z-Anatomy structures for: {pattern}')
        for o in hit:
            if o['name'] not in best or o['tris'] > best[o['name']]['tris']:
                best[o['name']] = o
    return sorted(o['file'] for o in best.values())


groups, meta = [], {}
for g in desc['groups']:
    files = bp3d(g.get('bp3d', [])) + za_files(g.get('za', []))
    groups.append({'name': g['name'], 'files': files, 'ratio': g.get('ratio', 0.3), 'error': g.get('error', 0.005),
                   'parts': g.get('parts', False)})
    meta[g['name']] = {k: g[k] for k in ('layer', 'joint', 'weighted', 'follow', 'toggle', 'inset') if k in g}

json.dump({
    'objDirs': [muscle_dir, *([za_dir] if za_dir != '-' else []), obj_dir],
    'offset': desc['offset'],
    'groups': groups,
    'rig': {
        'title': desc['title'],
        'joints': desc.get('joints', []),
        'groups': meta,
        'motion': desc.get('motion'),
        'view': desc['view'],
        'about': desc['about'],
    },
}, open(out, 'w'), indent=1, ensure_ascii=False)
print({g['name']: len(g['files']) for g in groups})
