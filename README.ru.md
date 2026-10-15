<p align="center">
	<a href="README.md"><img src="https://img.shields.io/badge/English-555?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MCAzMCI+PGNsaXBQYXRoIGlkPSJ0Ij48cGF0aCBkPSJNMzAsMTVoMzB2MTV6djE1aC0zMHpoLTMwdi0xNXp2LTE1aDMweiIvPjwvY2xpcFBhdGg+PHBhdGggZD0iTTAsMHYzMGg2MHYtMzB6IiBmaWxsPSIjMDEyMTY5Ii8+PHBhdGggZD0iTTAsMCA2MCwzME02MCwwIDAsMzAiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI2Ii8+PHBhdGggZD0iTTAsMCA2MCwzME02MCwwIDAsMzAiIGNsaXAtcGF0aD0idXJsKCN0KSIgc3Ryb2tlPSIjQzgxMDJFIiBzdHJva2Utd2lkdGg9IjQiLz48cGF0aCBkPSJNMzAsMHYzME0wLDE1aDYwIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMTAiLz48cGF0aCBkPSJNMzAsMHYzME0wLDE1aDYwIiBzdHJva2U9IiNDODEwMkUiIHN0cm9rZS13aWR0aD0iNiIvPjwvc3ZnPg==" alt="English"></a>
	<img src="https://img.shields.io/badge/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-0066cc?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5IDYiPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0wIDBoOXYzSDB6Ii8+PHBhdGggZmlsbD0iIzAwMzlhNiIgZD0iTTAgMmg5djJIMHoiLz48cGF0aCBmaWxsPSIjZDUyYjFlIiBkPSJNMCA0aDl2MkgweiIvPjwvc3ZnPg==" alt="Русский">
</p>

<!-- Раскомментировать, когда в .github/assets появится banner.jpg.
<p align="center">
	<a href="https://wodcare.aimuzov.online"><img src=".github/assets/banner.jpg" alt="Wodcare: Справочник травм в кроссфите: как часто случаются, симптомы, когда к врачу и как адаптировать тренировки — со ссылками на исследования." width="100%"></a>
</p>
-->

<p align="center">
	<a href="https://github.com/aimuzov-projects/wodcare/actions/workflows/deploy.yml"><img src="https://img.shields.io/github/actions/workflow/status/aimuzov-projects/wodcare/deploy.yml?branch=main&label=deploy" alt="Deploy"></a>
	<a href="https://wodcare.aimuzov.online"><img src="https://img.shields.io/website?url=https%3A%2F%2Fwodcare.aimuzov.online&label=site" alt="Site status"></a>
	<a href="package.json"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Faimuzov-projects%2Fwodcare%2Fmain%2Fpackage.json&query=%24.engines.node&label=node&logo=nodedotjs&logoColor=white&color=5fa04e" alt="Node"></a>
	<a href="https://astro.build"><img src="https://img.shields.io/github/package-json/dependency-version/aimuzov-projects/wodcare/astro?logo=astro&logoColor=white&color=bc52ee" alt="Astro"></a>
	<a href="https://svelte.dev"><img src="https://img.shields.io/github/package-json/dependency-version/aimuzov-projects/wodcare/svelte?logo=svelte&logoColor=white&color=ff3e00" alt="Svelte"></a>
	<a href="LICENSE"><img src="https://img.shields.io/github/license/aimuzov-projects/wodcare" alt="License"></a>
</p>

<h3 align="center">Справочник травм в кроссфите: как часто случаются, симптомы, когда к врачу и как адаптировать тренировки — со ссылками на исследования.</h3>

<!-- Раскомментировать, когда в .github/assets появятся скриншоты.
<table>
	<tr>
		<td width="50%" align="center"><img src=".github/assets/home.jpg" alt="Главная"><br><b>Главная</b> для посетителей</td>
		<td width="50%" align="center"><img src=".github/assets/screen.jpg" alt="Второй экран"><br><b>Экран</b> что на нём</td>
	</tr>
</table>
-->

<p>Живёт на <a href="https://wodcare.aimuzov.online">wodcare.aimuzov.online</a>. Статичный сайт на <a href="https://astro.build">Astro</a>, интерактивные островки на <a href="https://svelte.dev">Svelte</a>.</p>

## Что внутри

- **Главная** (`/`): название и описание сайта из [`src/frontend/data/site.ts`](src/frontend/data/site.ts).
- **404**: заглушка «такой страницы нет» со ссылкой на главную.
- **Футер**: подпись автора из [infra-site-kit](https://github.com/aimuzov-projects/infra-site-kit) со ссылкой на исходный код, `repo` в [`site.ts`](src/frontend/data/site.ts).

## Как устроено

Всё лежит в `src/`:

- [`src/frontend`](src/frontend): сайт на Astro, это `srcDir` в `astro.config.mjs`. Импорты — через `#frontend/*`.
- Если проекту нужен свой API, он встаёт рядом с сайтом, как в shkatova-psychologist и prestige-logist: сервис в `src/backend` (`#backend/*`, голый Node без сборки), общий для обеих сторон код в `src/shared` (`#shared/*`), образ в `deploy/backend.Dockerfile` и второй сервис в `deploy/docker-compose.yml`. Сайт из `src/backend` ничего не импортирует.

Всё про сервер — в [`deploy`](deploy): Dockerfile, compose и nginx. Скрипт выкладки общий для всех сайтов и лежит в [infra-server](https://github.com/aimuzov-projects/infra-server).

Все файлы, компоненты тоже, называются в kebab-case: `base.astro`, `section-photo.astro`. Имя в разметке задаёт импорт (`import Base from '#frontend/layouts/base.astro'`), а за файлами следит правило `unicorn/filename-case` в oxlint.

## Запуск

Стек и раскладка — из [infra-site-template](https://github.com/aimuzov-projects/infra-site-template): Astro + Svelte 5, Prettier, oxlint, stylelint (BEM), `node --test` для unit-тестов, Playwright для e2e. Конфиги Prettier, stylelint, oxlint и Playwright и шаги CI берутся из [infra-site-kit](https://github.com/aimuzov-projects/infra-site-kit). Node берётся из [`mise.toml`](mise.toml), эта же версия закреплена в `package.json` и в [`deploy/frontend.Dockerfile`](deploy/frontend.Dockerfile).

```sh
cp .env.example .env   # может остаться пустым, но файл должен быть
npm ci
npm run dev
```

Перед коммитом — те же проверки, что в CI:

```sh
npm run format:check && npm run lint:js && npm run lint:css && npm run check && npm test && npm run build
```

E2E-тесты в [`e2e`](e2e) собирают сайт и открывают его в Chromium: каждая страница из sitemap отвечает без ошибок в консоли и проходит axe. В CI они идут после проверок. Браузер ставится один раз через `npx playwright install chromium`.

```sh
npm run test:e2e
```

## Мобильная версия

Safari на iPhone сам приближает страницу, когда встаёшь в поле ввода с текстом мельче 16px, и обратно не отдаляет. Поэтому у `input`, `textarea` и `select` на сенсорных экранах (`@media (--touch)`) шрифт не меньше `1rem`: базовое правило лежит в [`global.css`](src/frontend/styles/global.css), а компоненту со своим `font-size` у поля нужно повторить его у себя.

Зум целиком через `maximum-scale=1` или `user-scalable=no` в viewport не выключаем: тогда мелкий текст нечем увеличить тем, кто плохо видит.

## Content Security Policy

Сборка кладёт в каждую страницу CSP с хешами скриптов и стилей Astro (настройка `security.csp` в `astro.config.mjs`). В `npm run dev` политики нет, поэтому нарушения видны только после `npm run build && npm run preview` и на проде.

- Никаких атрибутов `style=""` и обработчиков вроде `onclick`: стили задаются классами и правилами в `<style>`, обработчики живут в `<script>`.
- Внешний скрипт, картинку или запрос (виджет, карту, шрифт с CDN) сначала нужно разрешить в `security.csp`. Из коробки там разрешён только сам сайт.
- После таких правок стоит открыть консоль браузера в `npm run preview`: всё заблокированное браузер пишет туда.

## Выкладка

Сервер проектов из [infra-server](https://github.com/aimuzov-projects/infra-server): мерж релизного PR, который ведёт release-please, запускает `deploy.yml`, он гоняет проверки и заходит по SSH. Шаги обоих берутся из [infra-site-kit](https://github.com/aimuzov-projects/infra-site-kit), там же адрес сервера и его строка `known_hosts`. Там ключ запускает общий [`deploy/site.sh`](https://github.com/aimuzov-projects/infra-server/blob/main/deploy/site.sh) из infra-server, который переключается на релизный тег и пересобирает контейнер `wodcare` (nginx со статикой) из [`deploy/docker-compose.yml`](deploy/docker-compose.yml). Сборка идёт в юните systemd, так что оборванное SSH-соединение её не прерывает. Домен и TLS держит общий Caddy. `.env` лежит на сервере в `/srv/wodcare`.

Job выкладки запускается, только когда переменная репозитория `DEPLOY_ENABLED` равна `true`, а SSH-ключ лежит в секрете `DEPLOY_SSH_KEY`. Пока сервер не готов, релиз гоняет одни проверки.

Быстро откатиться — запустить Deploy вручную с прошлым тегом: `gh workflow run deploy.yml -f tag=v1.2.3`. Исправление плохого коммита выезжает через релизный PR, как любое изменение.

## Лицензия

Код распространяется по лицензии [MIT](LICENSE). Содержимое сайта (тексты, изображения, имена и контакты) под неё не подпадает: все права защищены.
