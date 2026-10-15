<p align="center">
	<img src="https://img.shields.io/badge/English-0066cc?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MCAzMCI+PGNsaXBQYXRoIGlkPSJ0Ij48cGF0aCBkPSJNMzAsMTVoMzB2MTV6djE1aC0zMHpoLTMwdi0xNXp2LTE1aDMweiIvPjwvY2xpcFBhdGg+PHBhdGggZD0iTTAsMHYzMGg2MHYtMzB6IiBmaWxsPSIjMDEyMTY5Ii8+PHBhdGggZD0iTTAsMCA2MCwzME02MCwwIDAsMzAiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSI2Ii8+PHBhdGggZD0iTTAsMCA2MCwzME02MCwwIDAsMzAiIGNsaXAtcGF0aD0idXJsKCN0KSIgc3Ryb2tlPSIjQzgxMDJFIiBzdHJva2Utd2lkdGg9IjQiLz48cGF0aCBkPSJNMzAsMHYzME0wLDE1aDYwIiBzdHJva2U9IiNmZmYiIHN0cm9rZS13aWR0aD0iMTAiLz48cGF0aCBkPSJNMzAsMHYzME0wLDE1aDYwIiBzdHJva2U9IiNDODEwMkUiIHN0cm9rZS13aWR0aD0iNiIvPjwvc3ZnPg==" alt="English">
	<a href="README.ru.md"><img src="https://img.shields.io/badge/%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-555?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5IDYiPjxwYXRoIGZpbGw9IiNmZmYiIGQ9Ik0wIDBoOXYzSDB6Ii8+PHBhdGggZmlsbD0iIzAwMzlhNiIgZD0iTTAgMmg5djJIMHoiLz48cGF0aCBmaWxsPSIjZDUyYjFlIiBkPSJNMCA0aDl2MkgweiIvPjwvc3ZnPg==" alt="Русский"></a>
</p>

<!-- template-only: the template's own banner, site-bootstrapper cuts this block out of a new site. -->
<p align="center">
	<a href="https://github.com/aimuzov-projects/infra-site-template"><img src="https://raw.githubusercontent.com/aimuzov-projects/.github/main/profile/assets/infra-site-template.en.jpg" alt="infra-site-template: a starter for every new site" width="100%"></a>
</p>
<!-- /template-only -->

<!-- Uncomment once .github/assets/banner.en.jpg is in place.
<p align="center">
	<a href="https://__DOMAIN__"><img src=".github/assets/banner.en.jpg" alt="__NAME__: __DESCRIPTION_EN__" width="100%"></a>
</p>
-->

<p align="center">
	<a href="https://github.com/aimuzov-projects/__PROJECT__/actions/workflows/deploy.yml"><img src="https://img.shields.io/github/actions/workflow/status/aimuzov-projects/__PROJECT__/deploy.yml?branch=main&label=deploy" alt="Deploy"></a>
	<a href="https://__DOMAIN__"><img src="https://img.shields.io/website?url=https%3A%2F%2F__DOMAIN__&label=site" alt="Site status"></a>
	<a href="package.json"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Faimuzov-projects%2F__PROJECT__%2Fmain%2Fpackage.json&query=%24.engines.node&label=node&logo=nodedotjs&logoColor=white&color=5fa04e" alt="Node"></a>
	<a href="https://astro.build"><img src="https://img.shields.io/github/package-json/dependency-version/aimuzov-projects/__PROJECT__/astro?logo=astro&logoColor=white&color=bc52ee" alt="Astro"></a>
	<a href="https://svelte.dev"><img src="https://img.shields.io/github/package-json/dependency-version/aimuzov-projects/__PROJECT__/svelte?logo=svelte&logoColor=white&color=ff3e00" alt="Svelte"></a>
	<a href="LICENSE"><img src="https://img.shields.io/github/license/aimuzov-projects/__PROJECT__" alt="License"></a>
</p>

<h3 align="center">__DESCRIPTION_EN__</h3>

<!-- Uncomment once the screenshots are in .github/assets.
<table>
	<tr>
		<td width="50%" align="center"><img src=".github/assets/home.jpg" alt="Home page"><br><b>Home</b> for visitors</td>
		<td width="50%" align="center"><img src=".github/assets/screen.jpg" alt="Second screen"><br><b>Screen</b> what it shows</td>
	</tr>
</table>
-->

<p>Lives at <a href="https://__DOMAIN__">__DOMAIN__</a>. A static <a href="https://astro.build">Astro</a> site, interactive islands are written in <a href="https://svelte.dev">Svelte</a>.</p>

The site is in Russian, so the names below are translated.

## What's inside

- **Home** (`/`): the site name and description from [`src/frontend/data/site.ts`](src/frontend/data/site.ts).
- **404**: a "no such page" stub with a link home.
- **Footer**: the author credit from [infra-site-kit](https://github.com/aimuzov-projects/infra-site-kit) with a link to the source code, `repo` in [`site.ts`](src/frontend/data/site.ts).
- **Analytics**: Yandex Metrica, the counter component comes from [infra-site-kit](https://github.com/aimuzov-projects/infra-site-kit) and adds its own CSP sources; the counter number is `metrikaId` in [`site.ts`](src/frontend/data/site.ts).

## How it is built

Everything lives in `src/`:

- [`src/frontend`](src/frontend): the Astro site, it is the `srcDir` in `astro.config.mjs`. Imports go through `#frontend/*`.
- When the project needs its own API, it goes next to the site, the way shkatova-psychologist and prestige-logist do it: the service in `src/backend` (`#backend/*`, plain Node running TypeScript, no build), code both sides need in `src/shared` (`#shared/*`), the image in `deploy/backend.Dockerfile` and a second service in `deploy/docker-compose.yml`. The site never imports from `src/backend`.

Everything about the server is in [`deploy`](deploy): the Dockerfile, compose and nginx. The deploy script is shared by all sites and lives in [infra-server](https://github.com/aimuzov-projects/infra-server).

Every file, components included, is named in kebab-case: `base.astro`, `section-photo.astro`. The name used in markup comes from the import (`import Base from '#frontend/layouts/base.astro'`), and the `unicorn/filename-case` rule in oxlint keeps file names in line.

## Running

Stack and layout follow [infra-site-template](https://github.com/aimuzov-projects/infra-site-template): Astro + Svelte 5, Prettier, oxlint, stylelint (BEM), `node --test` for unit tests, Playwright for e2e. The Prettier, stylelint, oxlint and Playwright configs and the CI steps come from [infra-site-kit](https://github.com/aimuzov-projects/infra-site-kit). Node comes from [`mise.toml`](mise.toml), the same version is pinned in `package.json` and [`deploy/frontend.Dockerfile`](deploy/frontend.Dockerfile).

```sh
cp .env.example .env   # may stay empty, but the file has to exist
npm ci
npm run dev
```

Before committing, the same checks as in CI:

```sh
npm run format:check && npm run lint:js && npm run lint:css && npm run check && npm test && npm run build
```

E2E tests in [`e2e`](e2e) build the site and open it in Chromium: every sitemap page answers without console errors and passes axe, and when the site has a counter, the Metrika waits for the first interaction. CI runs them after the checks. The browser is installed once with `npx playwright install chromium`.

```sh
npm run test:e2e
```

## Mobile

Safari on iPhone zooms the page in when you tap a field whose text is under 16px, and never zooms back out. So `input`, `textarea` and `select` on touch screens (`@media (--touch)`) get at least `1rem`: the base rule lives in [`global.css`](src/frontend/styles/global.css), and a component that sets its own `font-size` on a field has to repeat it.

Zoom as a whole is not turned off with `maximum-scale=1` or `user-scalable=no` in the viewport: that leaves people with poor eyesight no way to enlarge small text.

## Content Security Policy

The build puts a CSP with hashes of Astro's scripts and styles into every page (the `security.csp` option in `astro.config.mjs`). `npm run dev` has no policy, so violations only show up after `npm run build && npm run preview` and in production.

- No `style=""` attributes or handlers like `onclick`: styles go through classes and rules in `<style>`, handlers live in `<script>`.
- An external script, image or request (a widget, a map, a font from a CDN) has to be allowed in `security.csp` first. Out of the box it allows only the site itself: the Yandex Metrica component brings its own hash and sources.
- After such changes, check the browser console in `npm run preview`: the browser reports everything it blocks there.

## Deployment

The projects server from [infra-server](https://github.com/aimuzov-projects/infra-server): merging the release PR that release-please keeps open runs `deploy.yml`, which runs the checks and logs in over SSH. The steps of both come from [infra-site-kit](https://github.com/aimuzov-projects/infra-site-kit), which also holds the server address and its `known_hosts` line. There the key runs the shared [`deploy/site.sh`](https://github.com/aimuzov-projects/infra-server/blob/main/deploy/site.sh) of infra-server, which checks out the release tag and rebuilds the `__PROJECT__` container (nginx with the static site) from [`deploy/docker-compose.yml`](deploy/docker-compose.yml). The build runs in a systemd unit, so a dropped SSH connection does not cut it short. The domain and TLS are handled by the shared Caddy. `.env` lives on the server in `/srv/__PROJECT__`.

The deploy job runs only when the repository variable `DEPLOY_ENABLED` is `true`, and the SSH key is the `DEPLOY_SSH_KEY` secret. Until the server is set up, a release only runs the checks.

To roll back fast, run Deploy by hand with the previous tag: `gh workflow run deploy.yml -f tag=v1.2.3`. A fix of the bad commit goes out through the release PR like any change.

## License

The code is licensed under [MIT](LICENSE). Site content (texts, images, names and contacts) is not covered by it: all rights reserved.
