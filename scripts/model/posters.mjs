// Снимки 3D-моделей статей для загрузки: стартовый кадр модели без фона и интерфейса, в светлой
// и тёмной теме, в широком и узком окне, по четыре снимка на иллюстрацию с моделью. Пока модель грузится, снимок лежит под
// ней (components/figure-3d.svelte) в том же кадре камеры (scene/model-frame.ts). Пересобирать
// при смене модели, кадра камеры или полей `model` статьи.
//
// usage: node scripts/model/posters.mjs [base url] [slug...]
// Нужны собранный сайт на base url (по умолчанию http://localhost:4321), Playwright из
// зависимостей сайта и ImageMagick (`magick`) для WebP. Без slug -- все статьи с моделью.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

import { NARROW_BELOW } from '#frontend/scene/model-frame.ts'

const [base = 'http://localhost:4321', ...only] = process.argv.slice(2)
const root = fileURLToPath(new URL('../../', import.meta.url))
const out = `${root}public/model/rig/poster`
const content = `${root}src/frontend/content/injuries`
const slugs = only.length
	? only
	: fs
			.readdirSync(content)
			.filter(
				(file) => file.endsWith('.md') && /^\s+model:/m.test(fs.readFileSync(path.join(content, file), 'utf8')),
			)
			.map((file) => file.replace(/\.md$/, ''))
// Окна съёмки. Широкое: угол камеры по вертикали FOV, снимок во всю высоту окна, по бокам запас
// на широкие экраны. Узкое (уже NARROW_BELOW): кадр телефона, снимок во всю ширину окна, сверху
// и снизу запас на высокие экраны
const WINDOWS = {
	wide: { width: 2000, height: 1000 },
	narrow: { width: 1000, height: 2200 },
}

if (WINDOWS.narrow.width / WINDOWS.narrow.height >= NARROW_BELOW) throw new Error('narrow window is not narrow')

const browser = await chromium.launch({
	headless: true,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
})

fs.mkdirSync(out, { recursive: true })

for (const [shape, viewport] of Object.entries(WINDOWS))
	for (const theme of ['light', 'dark']) {
		// Без анимаций модель стоит в стартовом кадре: камера не покачивается, сустав не сгибается
		const context = await browser.newContext({
			viewport,
			deviceScaleFactor: 1,
			colorScheme: theme,
			reducedMotion: 'reduce',
			bypassCSP: true,
		})

		for (const slug of slugs) {
			const page = await context.newPage()

			await page.goto(`${base}/injuries/${slug}/`, { waitUntil: 'networkidle' })

			const button = page.locator('[data-figure-3d]').first()
			const src = await button.evaluate((el) => el.parentElement.querySelector('img').getAttribute('src'))
			const key = path.basename(src, path.extname(src))

			await button.click()
			await page.locator('.figure3d[data-status=ready]').waitFor({ timeout: 60_000 })

			// Только канвас и без фона: прозрачный снимок модели
			await page.addStyleTag({
				content: `* { visibility: hidden !important; transition: none !important; }
				.figure3d__canvas { visibility: visible !important; }
				html, body, .figure3d, .figure3d::backdrop { background: transparent !important; }`,
			})

			await page.waitForTimeout(800)

			const full = `${out}/${key}-${theme}-${shape}.png`

			await page.locator('.figure3d__canvas').screenshot({ path: full, omitBackground: true })

			execFileSync('magick', [
				full,
				'-quality',
				'80',
				'-define',
				'webp:alpha-quality=85',
				full.replace(/png$/, 'webp'),
			])

			fs.rmSync(full)
			console.log(shape, theme, slug, key)
			await page.close()
		}

		await context.close()
	}

await browser.close()
