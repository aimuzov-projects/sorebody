import { readdirSync } from 'node:fs'
import { satteri } from '@astrojs/markdown-satteri'
import sitemap from '@astrojs/sitemap'
import svelte from '@astrojs/svelte'
import { defineConfig } from 'astro/config'

import { DEFAULT_SPORT } from './src/frontend/data/sports.ts'
import { blocksPlugin } from './src/frontend/lib/markdown-blocks.ts'

// Травмы с линзами в нескольких спортах: их `/injuries/<slug>/` -- настоящая общая страница,
// у остальных там переадресация на единственный разбор (pages/injuries/[slug].astro)
const SPORTS_DIR = new URL('./src/frontend/content/sports/', import.meta.url)
const lensCount = new Map()

for (const sport of readdirSync(SPORTS_DIR))
	for (const file of readdirSync(new URL(`${sport}/`, SPORTS_DIR)))
		lensCount.set(file, (lensCount.get(file) ?? 0) + 1)

const shared = new Set([...lensCount].filter(([, count]) => count > 1).map(([file]) => file.replace(/\.md$/, '')))

export default defineConfig({
	// Сайт живёт в `src/frontend` для того чтобы рядом поместились `src/backend`
	// и `src/shared`, когда проекту понадобится своё API.
	srcDir: './src/frontend',
	// Абсолютные URL в canonical, og:url и sitemap.
	site: 'https://sorebody.aimuzov.online',
	// CSS -- файлами в /_astro/ с вечным кешем: встроенный, он был почти половиной
	// веса каждой страницы и качался заново. Мелкие куски Astro встраивает сам
	build: { inlineStylesheets: 'auto' },
	// Svelte для интерактивных островов, остальное -- статический HTML
	// с ванильными скриптами.
	// В sitemap нет переадресаций со старых адресов (`/movements/`, `/injuries/` с одним спортом)
	// и копии главной на `/<спорт по умолчанию>/`: у неё canonical на `/`. Общие страницы
	// `/injuries/` травм нескольких спортов -- настоящие, с canonical на себя, они в sitemap.
	integrations: [
		svelte(),
		sitemap({
			filter: (page) => {
				const injury = page.match(/\/injuries\/([^/]+)\/$/)?.[1]

				if (injury) return shared.has(injury)

				return !page.includes('/movements/') && !page.endsWith(`/${DEFAULT_SPORT}/`)
			},
		}),
	],
	// Подсветка Shiki несовместима с CSP.
	// Маркеры `data-chart` в статьях превращаются в пиктограммы из frontmatter.
	markdown: { syntaxHighlight: false, processor: satteri({ hastPlugins: [blocksPlugin] }) },
	// Astro кладёт в `<meta>` страницы CSP с хешами своих скриптов и стилей.
	// `frame-ancestors` в `<meta>` не работает: его ставит Caddy (infra-server, sites/wodcare.caddy),
	// там разрешено встраивание только Метрике для вебвизора и карты кликов.
	// Источники Яндекса добавляет только components/metrika.astro, на страницы со счётчиком.
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
