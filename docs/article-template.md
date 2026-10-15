# Шаблон статьи Wodcare

Файл: `src/frontend/content/injuries/<slug>.md`. Slug, название, зона и частота — из таблицы
в плане `docs/superpowers/plans/2026-10-15-wodcare.md`.

```yaml
---
title: Разрыв передней крестообразной связки
titleEn: Anterior cruciate ligament tear
region: knee # shoulder | elbow | wrist-hand | lumbar | hip-groin | knee | ankle-foot | other
frequency: common # common | rare
movements: [box-jump, squat] # только slug из src/frontend/data/movements.ts
summary: Одна фраза до 220 знаков для карточки и описания страницы.
images:
    - src: /injuries/acl-01.jpg
      alt: Что изображено, для незрячих — конкретно
      caption: Подпись под картинкой. Схематичная иллюстрация, сгенерирована нейросетью.
sources:
    - pmid: '35278328'
      label: Knapik 2022, метаанализ 28 исследований
draft: true
---
```

Тело — ровно эти разделы, в этом порядке (тест проверяет):

## Что это

2–4 предложения простым языком: какая структура, что с ней происходит.

## Как часто в кроссфите

Цифры только из абстрактов PubMed, каждая — со ссылкой `[N](https://pubmed.ncbi.nlm.nih.gov/<PMID>/)`.
Нет данных по кроссфиту — так и написать.

## Механизм и движения

Как получают в зале, какие движения и ошибки техники. Маркированный список.

## Симптомы

Маркированный список.

## Когда сразу к врачу

Красные флаги, маркированный список. К какому специалисту идти.

## Первые шаги

Что делать в первые дни. Без доз лекарств и без назначений.

## Как адаптировать тренировки

Строки вида `- Вместо рывка → тяги рывковым хватом с пола до колен`.

## Профилактика

Маркированный список.

## Правила

- Каждый PMID в тексте есть в `sources`, и каждый из `sources` процитирован в тексте.
- PMID только реально полученные через E-utilities (`esearch`/`efetch`), не по памяти.
- Тон осторожный: справка, а не назначение. Без «вылечит», «точно», дозировок.
- Русская типографика: «ёлочки», длинное тире с пробелами, неразрывный пробел после коротких
  предлогов не нужен — его расставит typographer позже.
- `draft: true` у всех статей, пока врач не проверил.

## Иллюстрации

1–2 на статью, `mcp__nanobanana__generate_image` или `edit_image`:
`model: gemini-3-pro-image`, `aspectRatio: 16:9`, `size: 2K`, `outputDir` — scratchpad.
Промпт: «Anatomically accurate medical 3D illustration … Clean white background, soft studio
lighting, textbook medical visualization style, no text, no labels.» Для единого стиля — `edit_image`
с эталоном `public/injuries/knee-01-anatomy.jpg` (суставы конечностей) или
`public/injuries/disc-01-normal.jpg` (позвоночник) как второй картинкой-референсом.
Проверить анатомию глазами (`Read`). Ошибка, которую видно без специальных знаний, —
перегенерировать (до 3 попыток), не вышло — статья без картинки. Сжать:
`sips -Z 1200 -s format jpeg -s formatOptions 80 <in> --out public/injuries/<slug>-01.jpg`.
