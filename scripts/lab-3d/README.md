# Модель для /lab/3d/

`public/lab/body.glb` собрана из [BodyParts3D](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html),
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
`body.anchors.json` с центрами суставов, их надо перенести в `src/frontend/lab/zones.ts`.
