import { satteri } from '@astrojs/markdown-satteri'
import sitemap from '@astrojs/sitemap'
import svelte from '@astrojs/svelte'
import { defineConfig } from 'astro/config'

import { DEFAULT_SPORT } from './src/frontend/data/sports.ts'
import { chartsPlugin } from './src/frontend/lib/markdown-charts.ts'

export default defineConfig({
	// Сайт живёт в `src/frontend` для того чтобы рядом поместились `src/backend`
	// и `src/shared`, когда проекту понадобится своё API.
	srcDir: './src/frontend',
	// Абсолютные URL в canonical, og:url и sitemap.
	site: 'https://wodcare.aimuzov.online',
	// CSS немного, и встроенный в HTML он не блокирует первую отрисовку
	// отдельным запросом.
	build: { inlineStylesheets: 'always' },
	// Svelte для интерактивных островов, остальное -- статический HTML
	// с ванильными скриптами.
	// В sitemap нет переадресаций со старых адресов (`/movements/`, `/injuries/` с одним спортом)
	// и копии главной на `/<спорт по умолчанию>/`: у неё canonical на `/`.
	// Индексировать ли общие страницы `/injuries/` -- открытый вопрос docs/multisport-concept.md.
	integrations: [
		svelte(),
		sitemap({
			filter: (page) => !/\/(movements|injuries)\//.test(page) && !page.endsWith(`/${DEFAULT_SPORT}/`),
		}),
	],
	// Подсветка Shiki несовместима с CSP.
	// Маркеры `data-chart` в статьях превращаются в пиктограммы из frontmatter.
	markdown: { syntaxHighlight: false, processor: satteri({ hastPlugins: [chartsPlugin] }) },
	// Astro кладёт в `<meta>` страницы CSP с хешами своих скриптов и стилей.
	// `frame-ancestors` в `<meta>` не работает, встраивание блокирует Caddy
	// через `X-Frame-Options`.
	security: {
		csp: {
			// SDK Mini App грузится с telegram.org, как в wodlog.
			scriptDirective: { resources: ["'self'", 'https://telegram.org'] },
			directives: [
				"default-src 'self'",
				"img-src 'self' data:",
				"connect-src 'self'",
				"object-src 'none'",
				"base-uri 'self'",
				"form-action 'self'",
			],
		},
	},
})
