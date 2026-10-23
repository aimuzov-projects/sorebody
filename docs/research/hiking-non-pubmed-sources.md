# Травмы в хайкинге — источники вне PubMed

Поиск 23.10.2026: WebSearch, WebFetch и curl. Текст PDF извлечён локально через PDFKit (macOS), страницы
указаны по номеру страницы PDF, если не сказано иное. Каждая цифра ниже прочитана в самом документе; цифры
из вторичных пересказов (новости, Statista) помечены «вторично, не проверено» и в статьи не годятся.
Продолжение [hiking-injuries-pubmed.md](hiking-injuries-pubmed.md): там же правило двух треков (опросы
туристов и регистры спасателей не складываются).

Главный вывод: внешние источники дают **свежие числа событий, причин и смертей** (2023–2025 годы), но почти
не дают **места травмы и диагноза**. Публичные таблицы ÖKAS, Альпийской полиции, SAC, DAV и CNSAS считают
причину вызова («Sturz», «Herz-Kreislauf», «Blockierung»), а не травму. Разбивку по месту травмы из
найденного даёт только MREW, и только по 2017 год. Поэтому цифры частоты «голеностоп — X%», «голова — Y%»
в статьях остаются за PubMed (Faulhaber 2017, Rausch 2024), а внешние регистры годятся для «почему» и «как
часто вообще».

Ещё вывод: рекомендации WMS индексированы в PubMed, их можно цитировать по PMID уже сейчас. Мешает другое:
их абстракты общие, без чисел, а полного текста в PMC нет (проверено через Europe PMC REST: у 9 PMID ниже
`pmcid` пустой, `isOpenAccess: N`). По текущему правилу на них можно опирать только формулировки без цифр.

## Обзор источников

### Статистика

**ÖKAS — Jahresrückblick (Австрия, пресс-релиз с таблицами, нем.)**

- 2024: <https://alpinesicherheit.at/wp-content/uploads/2025/04/OeKAS-PA-Jahresrueckblick-2024_korrigiert-2.pdf>
  (найден через WordPress REST API сайта: `/wp-json/wp/v2/media?search=Jahresr`).
- 2023: <https://vavoe.at/wp-content/uploads/2024/01/230123_OeKAS_PA-Jahresrueckblick-2023.pdf> (копия на
  сайте союза альпийских обществ, 23.01.2024; оригинал на alpinesicherheit.at не искал).
- Jahresrückblick 2025 через тот же API не нашёлся (за 2026 год там только пресс-релизы от февраля и
  программа Alpinforum 2026).
- Считает: Unfälle, Verunfallte (tot, verletzt, unverletzt) по дисциплине, причине, возрасту, земле.
  Дисциплина «Wandern/Bergsteigen» — хайкинг вместе с альпинизмом без разделения.
- Ограничения: учтено только то, что известно полиции (вызов через номер экстренной службы или выезд
  спасателей). Руководитель Альпийской полиции прямо пишет о большой «Dunkelziffer» при лёгких травмах
  (2024, с. 10). Места травмы и диагноза в публичных таблицах нет.
- Цифры, прочитанные дословно:
    - 2024, с. 4: «Wandern/Bergsteigen 127 106 41% 37%» — 127 погибших (среднее за 10 лет 106), 41% всех
      309 погибших в горах.
    - 2024, с. 5: «Wandern/Bergsteigen 3.226 2.536 23% 21%» — 3226 пострадавших из 13 999.
    - 2024, с. 9: Herz-Kreislauf-Störung — 27% всех погибших в горах, 86 человек; в таблице 6
      «Wandern/Bergsteigen 53 42»: 53 в 2024 году (из 86), 42 в среднем за 10 лет. Столбцы сверены по
      таблице 7, где за 2024 год в сумме 86. «Der Großteil (72 %) der Opfer durch
      Herz-Kreislauf-Versagen ist im Jahr 2024 der Altersgruppe von 51 bis 80 Jahren zuzurechnen.»
    - 2023, с. 4: 99 погибших в Wandern/Bergsteigen (37%). С. 8: Herz-Kreislauf-Störung — 29% погибших,
      78 человек, из них «Wandern/Bergsteigen 48»; 92% — в возрасте 51–80 лет.
    - 2023, с. 14 (таблица 15, все дисциплины): Verunfallte с причиной «Sturz, Stolpern, Ausgleiten» —
      2251; «Herz-Kreislaufstörung» — 260.

**Alpinpolizei / BMI — ALPINSTATISTIK (Австрия, 6 страниц таблиц, нем.)**

- Ноябрь 2023 — октябрь 2024: <https://www.bmi.gv.at/202/Alpinpolizei/files/Alpinstatistik_2023_2024_BF.pdf>.
  Прошлые годы — `ALPINSTATISTIK2022_2023_bf_20240226.pdf`, `Alpinstatistik_Oesterreich_2021_2022.pdf` и т. д.
  в той же папке (видел в поиске, не открывал).
- С. 2, таблица 2: «Wandern/Bergst. 2440 1335 1473 120 3194» — 2440 аварий, 1335 без травм, 1473 с
  травмой, 120 погибших, 3194 пострадавших всего.
- Ограничения: сезон «ноябрь — октябрь», а не календарный год, поэтому с ÖKAS (январь — декабрь) не
  совпадает (120 против 127 погибших). Ни причин по дисциплинам, ни места травмы нет.

**SAC — Bergnotfallstatistik (Швейцария, нем.; есть fr/it)**

- Страница: <https://www.sac-cas.ch/de/ausbildung-und-sicherheit/sicher-unterwegs/bergnotfallstatistik/>.
- 2025: <https://www.sac-cas.ch/fileadmin/Ausbildung_und_Sicherheit/Sicher_unterwegs/Bergnotfallstatistik/2025/Bergnotfallstatistik_2025.pdf>;
  2024: `.../Bergnotfallstatistik/Bergnotf%C3%A4lle_Schweiz_2024_Version_mit_text_Internet-deutsch.pdf`
  (ссылки со страницы; 2024 скачан, но не разбирал). Ссылка из поиска на 2023 «ohne_text» отдаёт 404,
  рабочая — `Bergnotf%C3%A4lle_Schweiz_2023_Version_Internet-deutsch.pdf`.
- Считает: все вызовы Rega, Alpine Rettung Schweiz, KWRO, Air-Glaciers, включая эвакуацию невредимых и
  болезни (с. 2). Причина вызова, тяжесть по «medizinischem Index», возраст. Места травмы нет.
- Цифры 2025:
    - с. 4: «Fast die Hälfte (46 %) ereignete sich beim Wandern oder Bergwandern»;
    - с. 13: «Beim Bergwandern sind Stürze noch immer die häufigste Ursache für einen Notfall (2025: 39 %),
      dicht gefolgt von einer Blockierung oder Erschöpfung (2025: 35 %). Auch Erkrankungen (2025: 16 %)…»;
    - с. 17: погибшие при Bergwandern 2021–2025 — 68, 50, 51, 36, 36; с. 3: среднее за 10 лет — 53;
    - с. 7: невредимыми спасены 38% (2020 — 29%); с. 8: 63% спасённых здоровы или с лёгкой травмой без
      госпитализации.
- Ограничения: графики в PDF — картинки, их числа текстом не извлекаются; брал только то, что в тексте.

**DAV — Unfallstatistik (Германия, нем.)**

- Fact sheet 2022 (на 2.8.2023): <https://alpenverein.de/files/unfallstatistik-fact-sheet-2022.pdf>.
  Более свежего fact sheet не нашёл; полный отчёт 2020–21 — `magazin.alpenverein.de/files/2209_unfallstatistik-2020-21-final_ol.pdf`
  (не открывал).
- С. 1, «Wandern insgesamt»: 299 аварий и вызовов (†16), 384 пострадавших. Причины: «Sturz 58 %»,
  «körperliche Probleme 14 %», «Blockierung 23 %». У погибших: «Sturz 56 %», «Sturz oder Kreislaufversagen
  25 %», «Kreislaufversagen 13 %», «Verirren/Versteigen 6 %».
- Ограничения: только члены DAV, сообщившие о случае в страховку; знаменатель — члены клуба, а не
  хайкеры. Без мест травмы. Малые числа у погибших (16).

**bfu (Швейцария)** — первичной таблицы по Bergwandern не нашёл. «Около 37 000 травм в год» и «около 50
погибших» — вторично, не проверено. Есть PDF о смертельных спортивных травмах:
<https://bfu.ch/media/bymhj3y3/toedliche-sportunfaelle-185-personen-sterben-jedes-jahr-beim-sport.pdf> —
не открывал. bfu сам поставляет данные в SAC-статистику (с. 2 SAC 2025).

**Mountain Rescue England & Wales (англ.)**

- Подробные годовые отчёты 1980–2017: <https://www.mountain.rescue.org.uk/incident_statistics/>; с 2016 года
  обзор входит в Annual Review (не разбирал).
- 2017: <https://www.mountain.rescue.org.uk/wp-content/uploads/2020/04/2017MREWIncidentReport.pdf>.
    - PDF с. 14 (с. 12 отчёта), «Subject Injury Sites», столбец Hill Walking: «Lower Leg & Foot 162»,
      «Fractures 133», «Head 50», «Upper Leg & Knee 40», «Chest & Shoulder 37», «Arm & Hand 24», «Back & Neck
      22», «Lacerations etc. 21», «Hypothermia 15», «Pelvis 8», «Abdomen 7», «Heart Attack (fatal) 3»,
      «Heart Attack (non-fatal) 3».
    - PDF с. 9: Hill Walking injured по регионам 218, 49, 125, 3, 86, 6, 23, 2, 47 — в сумме 559; fatal 13 и 8.
    - PDF с. 10, причины у Hill Walking: «Slip. Trip or Stumble 249», «Fall or Tumble 208», «Lost or
      Overdue 171», «Medical Collapse or Illness 65».
- Ограничения: авторы пишут, что это поиск по ключевым словам в отчётах, «not definitive but indicative»;
  у одного человека может быть несколько мест, «Fractures» пересекается с местами. Делить 162 на 559 можно
  только с оговоркой «примерно», это не доля людей. Данные 2017 года — старше, чем австрийские из PubMed.

**NPS SAR (США)** — годовой SAR dashboard, по вторичным данным, обновлён до 2017 года; живой ссылки не
нашёл. Есть дашборд смертности <https://www.nps.gov/aboutus/mortality-data.htm> (2014–2019, по поиску;
таблицы не открывал). Обзор SAR 1992–2007 уже в PubMed (19737043).

**CNSAS (Италия, итал.)** — первичный отчёт не нашёл: на cnsas.it ссылок на данные нет, planetmountain
отдаёт 403. Вторично (не проверено): 2024 — 12 063 вызова, хайкинг 44,3%, «caduta o scivolata» 43,2%,
«malore» 12,7%.

### Полевые рекомендации

**ICAR MedCom** (англ., часть — нем.). Список: <https://www.alpine-rescue.org/topics/161--recommendations>
(страницы `?page=2…12`). PDF лежат на `www.alpine-rescue.org/system/production/article/documents/…`.
Писались для спасателей и врачей, многие старые:

- REC M 0024 «Immobilization and Splinting in Mountain Rescue» (2009):
  <https://www.alpine-rescue.org/articles/185--immobilization-and-splinting-in-mountain-rescue>;
- REC M 0008 «Treatment of Dislocations and Fractures» (1996): `/articles/48--…`;
- REC M 0032 «Managing Moderate and Severe Pain in Mountain Rescue» (2019): `/articles/261--…`;
- REC M 0014 «The Medical On Site Treatment of Hypothermia» (1998): `/articles/54--…`. Новая версия
  стадирования ICAR — «Revised Swiss System» (Musi 2021), она в PubMed: 34082033, 33675869 (не сверял,
  какая из двух — основная). В статье о переохлаждении уже есть Paal 2022 (35010760) от ICAR MedCom;
- REC M 0015 «On Site Treatment of Frostbite for Mountaineers» (2000): `/articles/55--…`;
- REC M 0019 «The Use of Automated Electric Defibrillators and Public Access Defibrillators» (2006):
  `/articles/107--…`;
- REC M 0035 «First Aid Kit» (2017): `/articles/449--first-aid-kit`;
- «ICAR Termination of Resuscitation in Mountain Rescue updated Recommendations»: `/articles/1217--…`.

Содержание этих PDF я не читал, только названия и даты из имён файлов.

**UIAA MedCom** (англ. и переводы). Список: <https://theuiaa.org/mountain-medicine/medical-advice/>.
Касаются хайкинга:

- No 11 «The Use of Hiking Sticks in the Mountains», обновление 2021:
  <https://www.theuiaa.org/documents/mountainmedicine/English_UIAA_MedCom_RecNo11_Hikingsticks2021_V1-1.pdf>
  (прочитан). С. 2: на спуске палки снижают нагрузку на суставы ног, с рюкзаком две палки дают лучшее
  равновесие, чем одна. С. 3: недостатки — при долгом использовании страдает равновесие, и «the most
  common type of hiking accident, a fall by tripping or stumbling, can actually be made a greater risk».
  С. 4: здоровому хайкеру проще научиться эластичной технике спуска без палок.
- No 21 «People with Pre-existing Cardiovascular Conditions Going to the Mountains», 2012:
  <https://www.theuiaa.org/documents/mountainmedicine/English_UIAA_MedCom_No_21_Cardiovascular_Diseases_2012_V1-2.pdf>
  (прочитан раздел 3.1). С. 7: «SCD accounts for up to 52% of deaths during downhill skiing and 30% of
  mountain hiking fatalities [11]»; риск выше всего в первый день на высоте, поздним утром, во время и
  сразу после непривычной нагрузки. С. 8: отдых в первый день, постепенный рост нагрузки, регулярная еда
  и питьё; нагрузочный тест и тренировки для неактивных мужчин старше 40 лет.
- No 2 «AMS, HAPE, HACE», 2012, V3.3:
  <https://www.theuiaa.org/documents/mountainmedicine/English_UIAA_MedCom_Rec_No_2_AMS_HAPE_HACE_2012_V3.3.pdf>
  (не читал; старше WMS 2024).
- Отдельных англоязычных UIAA papers о мозолях, обморожении, переохлаждении, жаре, гипонатриемии и
  внезапной смерти в списке ссылок страницы нет.

**WMS — Clinical Practice Guidelines** (англ., Wilderness & Environmental Medicine). Страница WMS со
списком отдаёт 404, но все рекомендации есть в PubMed. Нашёл через esearch
`"Wilderness Medical Society"[ti] AND guideline*[ti] AND 2017:2026[dp]` (35 PMID), названия сверены через
esummary. Подходят для хайкинга:

| PMID     | Рекомендация                                    | Год  | Уже в статьях        |
| -------- | ----------------------------------------------- | ---- | -------------------- |
| 37833187 | Acute Altitude Illness: 2024 Update             | 2024 | нет (есть Luks 2017) |
| 38425235 | Heat Illness: 2024 Update                       | 2024 | нет                  |
| 41533424 | Heat Illness (обзор-пересказ, Nelson)           | 2025 | нет                  |
| 32044213 | Exercise-Associated Hyponatremia: 2019 Update   | 2020 | нет                  |
| 38577729 | Frostbite: 2024 Update                          | 2024 | да, frostbite        |
| 31740369 | Accidental Hypothermia: 2019 Update             | 2019 | нет                  |
| 38379496 | Spinal Cord Protection: 2024 Update             | 2024 | нет                  |
| 38651342 | Acute Pain in Austere Environments: 2024 Update | 2024 | нет                  |
| 38710506 | Medical Direction of SAR Teams                  | 2024 | нет                  |

Абстракты 6 из них (38425235, 32044213, 37833187, 31740369, 38379496, 38651342) прочитаны через efetch:
это описание метода и области, без конкретных рекомендаций и чисел. Полного текста в PMC нет; на сайте
SAGE (journals.sagepub.com) curl получил 403, открытость у издателя не проверена. Отдельной рекомендации
WMS о мозолях в этой выдаче нет.

## Таблица по 16 статьям

Важность: **высокая** — свежая цифра того же смысла или прямая рекомендация к «Что делать»; **средняя** —
полезный контекст или рекомендация не для мирян; **низкая** — нечего добавить.

| Статья                           | Сейчас в статье (PubMed)                                         | Что дают внешние источники                                                                                                                                                                                                                                                                                                                                             | Важность |
| -------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| sudden-cardiac-arrest            | ВСС — 44% смертей в горном хайкинге Австрии, 1997–2018           | ÖKAS: Herz-Kreislauf-Störung у 48 из 99 погибших в Wandern/Bergsteigen за 2023 год (с. 4, 8) и у 53 из 127 за 2024 год (с. 4, 9). Это свежее, но «нарушение кровообращения», а не подтверждённая ВСС, и вместе с альпинизмом. UIAA No 21 (с. 7–8) — первый день, позднее утро, непривычная нагрузка, тест для неактивных мужчин 40+. ICAR REC M 0019 — АНД (не читал). | высокая  |
| fall-contusions                  | 28,9% ушибов и растяжений, регистр 2015–2021                     | Разбивки «ушиб» во внешних таблицах нет. Причины: SAC 2025 — падение 39% вызовов при Bergwandern (с. 13); DAV 2022 — «Sturz 58 %»; MREW 2017 — «Slip. Trip or Stumble 249», «Fall or Tumble 208». UIAA No 11 — палки и риск падения.                                                                                                                                   | средняя  |
| ankle-sprain                     | голеностоп и стопа — самое частое место, 37,8% (Альпы 2006–2014) | MREW 2017: «Lower Leg & Foot 162» — самая частая строка у Hill Walking (из 559 травмированных; поиск по ключевым словам, голень и стопа вместе). Это второй регистр с тем же выводом, но не свежее и не точнее. ICAR REC M 0024 — шинирование (для спасателей).                                                                                                        | средняя  |
| lower-leg-fracture               | голень — 10% у выживших при падении                              | MREW 2017: «Lower Leg & Foot 162», «Fractures 133» — отдельно «перелом голени» не выделен. ICAR REC M 0024 и REC M 0008 (1996), WMS Acute Pain 2024 (38651342) — шина и обезболивание, текст не прочитан.                                                                                                                                                              | средняя  |
| concussion                       | голова — 12,8% выживших, 43,4% погибших                          | MREW 2017: «Head 50» у Hill Walking. WMS Spinal Cord Protection 2024 (38379496) — для «Что делать» при подозрении на травму шеи; абстракт без конкретики, полный текст не прочитан.                                                                                                                                                                                    | средняя  |
| wrist-sprain                     | руки — 9–14% травм в регистрах                                   | MREW 2017: «Arm & Hand 24». UIAA No 11 — палки на спуске и равновесие. Свежее нет.                                                                                                                                                                                                                                                                                     | низкая   |
| low-back-strain                  | NOLS — спина 13% спортивных травм; лямки 46%                     | MREW 2017: «Back & Neck 22» — травма, а не перегрузка; к статье о боли от рюкзака подходит плохо. UIAA No 11 (с. 2) — палки разгружают позвоночник при рюкзаке.                                                                                                                                                                                                        | низкая   |
| patellofemoral-pain              | NOLS — колено 35%; Аппалачская тропа — боль в суставах 36%       | MREW 2017: «Upper Leg & Knee 40» — острая травма, не перегрузка. UIAA No 11 (с. 2–4): палки на спуске снижают нагрузку на суставы ног, техника спуска короткими эластичными шагами — хорошо подкрепляет «Что делать».                                                                                                                                                  | средняя  |
| acute-altitude-illness           | 47%; Luks 2017, Omidi 2025                                       | WMS 2024 Update (37833187) — первичная рекомендация вместо обзора первого автора и пересказа. Полный текст не в PMC, абстракт без чисел: по нынешнему правилу годится только как ссылка на рекомендацию без цифр. UIAA No 2 (2012) старше.                                                                                                                             | высокая  |
| exertional-heat-illness          | Гранд-Каньон 2004–2009; 90% тепловых случаев у хайкеров          | WMS Heat Illness 2024 Update (38425235) — первичная рекомендация к «Что делать» (охлаждение, профилактика); текст не прочитан. Свежей цифры частоты не нашёл. SAC 2025: «Erkrankungen» 16% вызовов при Bergwandern (с. 13) — без разбивки, тепло там не выделено.                                                                                                      | высокая  |
| exercise-associated-hyponatremia | Гранд-Каньон: подозрение у 90 из 474, ~19%                       | WMS EAH 2019 Update (32044213). Абстракт даёт определение: натрий «below the normal reference range of 135 mmol·L-1» во время нагрузки или до 24 ч после — это есть в абстракте и годится сразу. Свежей частоты у хайкеров не нашёл.                                                                                                                                   | высокая  |
| hypothermia                      | Япония 2011–2015: 14,8% погибших; Шотландия 13,8%                | MREW 2017: «Hypothermia 15» у Hill Walking. WMS Accidental Hypothermia 2019 (31740369) и ICAR Revised Swiss System (Musi 2021, PMID 34082033 или 33675869, не сверял) — стадирование для «Что делать». ICAR REC M 0014 (1998) устарела.                                                                                                                                | средняя  |
| frostbite                        | Австрия: 18,1%; Денали; WMS Frostbite 2024 уже есть (38577729)   | ICAR REC M 0015 (2000) старше WMS 2024 — замены нет. Цифры обморожений у хайкеров во внешних таблицах нет.                                                                                                                                                                                                                                                             | низкая   |
| foot-blisters                    | 64% на Аппалачской тропе, 74% на Камино                          | Регистры мозоли не видят. Рекомендации ICAR, UIAA или WMS о мозолях не нашёл.                                                                                                                                                                                                                                                                                          | низкая   |
| meralgia-paresthetica            | 34% онемения на Аппалачской тропе                                | Ничего: ни в регистрах, ни в рекомендациях.                                                                                                                                                                                                                                                                                                                            | низкая   |
| rucksack-palsy                   | военные, Финляндия, Нидерланды                                   | Ничего.                                                                                                                                                                                                                                                                                                                                                                | низкая   |

Общее для статей с «регистровым» треком (sudden-cardiac-arrest, fall-contusions, ankle-sprain,
lower-leg-fracture, concussion, wrist-sprain): одной фразой можно добавить свежий масштаб, например «в 2024
году в Австрии при Wandern/Bergsteigen пострадали 3226 человек, 127 погибли» (ÖKAS 2024, с. 4–5) или «в
Швейцарии почти половина вызовов спасателей — хайкинг, 46%» (SAC 2025, с. 4). Это знаменатель «вызовы»,
и с долями мест травмы из PubMed его не смешивать.

## Что поменять в правилах и тестах

Сейчас (код не менял):

- `src/frontend/lib/sources.ts`: `GUIDELINE_SITES` — список хостов для `{ url, label }`; `guidelineSite()`
  пускает только https и хост из списка. `citeKey()` превращает ссылку в ключ сноски, только если хост в
  списке; ссылка на другой хост в тексте просто не считается сноской. `sourcesSummary()` называет все
  не-PMID источники «клинические рекомендации». `sourceSite()` показывает подпись из списка или голый хост.
- `src/frontend/lib/injury-schema.ts` (около строки 143): `sourcesSchema` — union `{pmid, label}` или
  `{url, label}` с refine «сайт рекомендаций не из списка».
- `src/frontend/lib/sources.test.ts`: «schema accepts guideline sources from listed sites only» (example.com
  должен падать), подсчёт в `sourcesSummary`.
- `src/frontend/lib/content.test.ts` (около строки 292): `data/pubmed.json` должен покрывать все PMID и
  ничего лишнего; URL-источники не проверяются.
- `scripts/sources/fetch.mjs` тянет метаданные только по PMID; для URL-источников метаданных нет, подпись
  целиком в `label`.
- `docs/article-template.md`, «Правила»: «PMID только реально полученные…», «каждая цифра со сноской должна
  быть в абстракте этого PMID или в его открытом полном тексте (PMC)».

Что нужно:

1. **Хосты.** Добавить в `GUIDELINE_SITES`: `alpinesicherheit.at` («ÖKAS»), `www.bmi.gv.at`
   («Альпийская полиция Австрии»), `www.sac-cas.ch` («SAC»), `www.alpenverein.de` и `alpenverein.de`
   («DAV»; fact sheet открывается с хоста без www), `www.mountain.rescue.org.uk` («MREW»),
   `www.alpine-rescue.org` («ICAR»), `www.theuiaa.org` («UIAA»). У ÖKAS 2023 копия лежит на `vavoe.at`:
   лучше найти оригинал на alpinesicherheit.at, чем пускать чужой хост. В `sources.test.ts` — по одному
   кейсу на новый хост.
2. **Вид источника.** Сейчас всё не-PMID — «клиническая рекомендация», и «18 работ из PubMed и 2
   клинические рекомендации» соврёт про статистику ÖKAS. Нужен тип у хоста: `guideline` или `registry`
   («статистика спасателей»), и третья группа в `sourcesSummary` со своими формами множественного числа и
   тестом.
3. **PDF и страница.** Цифры в этих источниках на конкретной странице PDF. Предложение: в `label` писать
   год и страницу («ÖKAS, Jahresrückblick 2024, с. 4»), а ссылка — на сам PDF. Если хочется `#page=4` в
   URL, `citeKey` должен сравнивать ссылки с якорем как разные или срезать якорь — нужно решить и покрыть
   тестом, сейчас сравнение строгое.
4. **Правило про цифры.** Дописать в «Правила»: цифра из источника вне PubMed должна быть дословно в этом
   документе на указанной странице; пересказы в СМИ и Statista не годятся. Для регистров — подпись
   говорит, что считали (вызовы, а не травмы; «Wandern/Bergsteigen» вместе с альпинизмом; сезон
   ноябрь — октябрь у BMI).
5. **WMS без PMC.** Рекомендации WMS проходят по PMID, но их цифры в полном тексте за пейволлом. Либо
   оставить правило как есть (цитировать WMS только в формулировках без чисел), либо разрешить «полный
   текст у издателя» с пометкой в `label` — тогда проверку уже не повторить без доступа. Предлагаю первое.
6. **Устаревание.** Регистры выходят каждый год. Можно добавить в `label` год данных и в тест — предупреждение,
   если год старше N лет; это необязательно.
7. **Проверка живости ссылок.** У `fetch.mjs` нет аналога для URL. Ссылка SAC 2023 из поиска уже отдаёт 404:
   полезен скрипт или тест (вне CI, по сети), который делает HEAD по всем URL-источникам.

## Что не нашёл

- Публичной разбивки по месту травмы или диагнозу у хайкеров в ÖKAS, BMI, SAC, DAV — только причины и
  исходы. Свежее (после 2017) место травмы — ни у одного регистра.
- ÖKAS Jahresrückblick 2025 (не нашёлся через API сайта).
- Первичных отчётов CNSAS и bfu; живого NPS SAR dashboard новее 2017 года.
- Рекомендаций ICAR, UIAA или WMS о мозолях, мералгии, рюкзачном параличе, боли в пояснице.
- Полного текста рекомендаций WMS 2019–2024 в открытом доступе.
- Содержания PDF ICAR (прочитаны только названия и даты) и отчёта SAC 2024.
