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
cp "$here/build.mjs" "$here/rig.mjs" "$here/skin-test.mjs" "$cache/tools/"

python3 -I "$here/rig.py" "$cache/bp3d" "$cache/bp3d/obj" "$cache/mus" "$cache/za-aligned" "$here/rigs/$name.json" "$work/config.json"
blender -b --factory-startup --python "$here/remesh.py" -- "$cache/bp3d/obj" "$cache/mus" 1 10 1 "$work/config.json" |
	grep -E 'remeshed|kept'
node "$cache/tools/build.mjs" "$work/config.json" "$here/../../public/model/rig/$name.glb" | grep -E 'tris after|written'
