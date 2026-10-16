# 3D-модель главной

`public/model/body.glb` собрана из [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html),
архив `isa_BP3D_4.0_obj_99.zip` (136 МБ) и `isa_element_parts.txt`. Три меша: `skin` (кожа целиком), `muscles`
(316 элементов из "muscle organ" и "tendon", без мышц глаза и языка), `bones` (240 элементов: "bone organ", рёберные
хрящи, межпозвонковые диски, лобковый симфиз).

Лицензия: README базы с 2025 года говорит CC BY 4.0, а заголовки самих OBJ -- CC BY-SA 2.1 JP. На странице
"О справочнике" указана более строгая CC BY-SA 2.1 JP: производная модель тоже под ней.

Скрипты зависят от `@gltf-transform/core|functions|extensions@4.5.1` и `meshoptimizer@1.3.0`, в зависимости сайта не
входят: ставить в отдельную папку.

```bash
python3 -I config.py <папка со списками> <папка с OBJ> body.json 0.08 0.12 --skin
node build.mjs body.json body.glb
```

Аргументы `0.08 0.12` -- доля треугольников мышц и костей после упрощения, кожа -- 0.3. Рядом с GLB появится
`body.anchors.json` с центрами суставов, их надо перенести в `src/frontend/scene/zones.ts`.

## Детальные куски зон (проба)

`detail.py` собирает конфиги кусков: все слои BodyParts3D (кости, мышцы, хрящи и связки, артерии, вены, нервы) в
сфере 1,25 радиуса вокруг каждой точки зоны из `zones.ts`. `offset` берётся из лога сборки фигуры, чтобы кусок лёг в
её координаты; `build.mjs` по `clip` оставляет только треугольники в сфере. Последний аргумент -- доля треугольников,
`1` -- без упрощения.

```bash
python3 -I detail.py <папка со списками> <папка с OBJ> detail/ <offset x,y,z> 0.5
for c in detail/*.json; do node build.mjs $c ${c%.json}.glb; done
```
