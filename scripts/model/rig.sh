#!/bin/sh
# Собирает 3D-модель статьи по описателю: rigs/<name>.json -> public/model/rig/<name>.glb.
# usage: sh scripts/model/rig.sh <name>
#
# Данные лежат вне репозитория, в SOREBODY_MODEL_CACHE (по умолчанию ~/.cache/sorebody-model):
#   bp3d/obj, bp3d/isa_element_parts.txt -- BodyParts3D (README, «3D-модель главной»);
#   za-aligned -- Z-Anatomy после z_align.py (README, «Связки, мениски и нервы»);
#   mus -- мышцы после remesh.py, пополняется сама; tools -- зависимости build.mjs, ставятся сами.
set -e

name=$1
[ -n "$name" ] || { echo "usage: sh scripts/model/rig.sh <name>" >&2; exit 1; }

here=$(cd "$(dirname "$0")" && pwd)
cache=${SOREBODY_MODEL_CACHE:-$HOME/.cache/sorebody-model}
work=$cache/rig-build/$name

mkdir -p "$work" "$cache/mus" "$cache/tools"

# Зависимости build.mjs в зависимости сайта не входят: ставим их рядом с копией скриптов
if [ ! -d "$cache/tools/node_modules/@gltf-transform" ]; then
	(cd "$cache/tools" && echo '{"type":"module","private":true}' > package.json &&
		npm install --silent --no-audit --no-fund @gltf-transform/core@4.5.1 @gltf-transform/functions@4.5.1 \
			@gltf-transform/extensions@4.5.1 meshoptimizer@1.3.0)
fi
cp "$here/build.mjs" "$here/rig.mjs" "$here/skin-test.mjs" "$here/rig-body.mjs" "$here/knee-frames.mjs" "$cache/tools/"

# Модель из кадров расчёта (`frames` в описателе -- папка в кэше): колено Open Knee(s). Скачивание
# и разбор -- openknee/fetch.py и prepare.py, их зависимости -- в своём venv рядом с данными
frames=$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get("frames", ""))' "$here/rigs/$name.json")

if [ -n "$frames" ]; then
	data=$cache/$frames
	knee=$(basename "$frames")

	if [ ! -f "$data/knee.json" ]; then
		venv=$cache/openknee/.venv
		[ -x "$venv/bin/python" ] || { uv venv -q "$venv" && uv pip install -q --python "$venv/bin/python" numpy scipy trimesh; }
		python3 -I "$here/openknee/fetch.py" "$knee" "$data"
		"$venv/bin/python" -I "$here/openknee/prepare.py" "$data"
	fi

	node "$cache/tools/knee-frames.mjs" "$data/knee.json" "$here/rigs/$name.json" "$here/../../public/model/rig/$name.glb" |
		grep -E 'tris|written|normal deltas'
	exit
fi

# Модель из готовой фигуры главной (`fromGlb` в описателе): без сборки из OBJ
if python3 -I -c 'import json,sys; sys.exit(0 if "fromGlb" in json.load(open(sys.argv[1])) else 1)' "$here/rigs/$name.json"; then
	node "$cache/tools/rig-body.mjs" "$here/rigs/$name.json" "$here/../../public/model" "$here/../../public/model/rig/$name.glb"
	exit
fi

python3 -I "$here/rig.py" "$cache/bp3d" "$cache/bp3d/obj" "$cache/mus" "$cache/za-aligned" "$here/rigs/$name.json" "$work/config.json"
blender -b --factory-startup --python "$here/remesh.py" -- "$cache/bp3d/obj" "$cache/mus" 1 10 1 "$work/config.json" |
	grep -E 'remeshed|kept'
node "$cache/tools/build.mjs" "$work/config.json" "$here/../../public/model/rig/$name.glb" | grep -E 'tris after|written'
