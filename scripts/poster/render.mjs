// Постер фигуры для загрузки главной: снимок стартового кадра сцены без фона и интерфейса,
// обрезанный по проекции коробки фигуры. Пересобирать при смене модели или камеры
// (src/frontend/scene/frame.ts): тест кадра сравнит числа в poster.json с текущими.
//
// usage: node scripts/poster/render.mjs [base url]
// Нужны собранный сайт на base url (по умолчанию http://localhost:4329), Playwright из
// зависимостей сайта и ImageMagick (`magick`) для WebP и PNG.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

import * as frame from '#frontend/scene/frame.ts'

const base = process.argv[2] ?? 'http://localhost:4329'
const root = fileURLToPath(new URL('../../', import.meta.url))
const out = `${root}public/model/poster`
const meta = `${root}src/frontend/scene/poster.json`
// Опорное окно в двойной плотности: дальше постер только уменьшается. Кадр в режиме
// ?poster -- POSTER_SHIFT, коробка фигуры в нём целиком в окне
const viewport = { width: 1440, height: 900 }
const browser = await chromium.launch({
	headless: true,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
})
const page = await (await browser.newContext({ viewport, deviceScaleFactor: 2, bypassCSP: true })).newPage()

await page.goto(`${base}/?poster`)
await page.waitForFunction(() => 'posterBounds' in window, null, { timeout: 60_000 })

// Только канвас и без фона: прозрачный снимок фигуры с тенью
await page.addStyleTag({
	content: `* { visibility: hidden !important; transition: none !important; }
		.body3d__canvas { visibility: visible !important; opacity: 1 !important; }
		html, body, .home, .body3d { background: transparent !important; }`,
})

await page.waitForTimeout(500)

const box = await page.evaluate(() => window.posterBounds)
// Проекция -- по канвасу, а не по окну: окно шире на место под полосу прокрутки
// (scrollbar.css из infra-site-kit), и обрезка по окну сдвигала фигуру в постере на полполосы
const canvas = await page.evaluate(() => {
	const { left, top, width, height } = document.querySelector('.body3d__canvas').getBoundingClientRect()

	return { left, top, width, height }
})
const projected = frame.projectBox(box, canvas.width, canvas.height, frame.POSTER_SHIFT)
const rect = { ...projected, left: canvas.left + projected.left, top: canvas.top + projected.top }

await page.screenshot({
	path: `${out}-full.png`,
	omitBackground: true,
	clip: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
})

await browser.close()

// 1000 px по высоте хватает и ретине телефона, и десктопу; WebP с альфой, PNG -- запасной
execFileSync('magick', [
	`${out}-full.png`,
	'-resize',
	'x1000',
	'-quality',
	'82',
	'-define',
	'webp:alpha-quality=90',
	`${out}.webp`,
])

execFileSync('magick', [`${out}-full.png`, '-resize', 'x1000', '-strip', '-colors', '256', `PNG8:${out}.png`])
fs.rmSync(`${out}-full.png`)

fs.writeFileSync(
	meta,
	`${JSON.stringify(
		{
			box,
			frame: {
				FRAME: frame.FRAME,
				NARROW: frame.NARROW,
				TARGET_Y: frame.TARGET_Y,
				POLAR_DEG: frame.POLAR_DEG,
				AZIMUTH_DEG: frame.AZIMUTH_DEG,
				POSTER_SHIFT: frame.POSTER_SHIFT,
			},
		},
		null,
		'\t',
	)}\n`,
)

// В стиле репозитория, иначе format:check споткнётся о массивы в столбик
execFileSync('npx', ['prettier', '--write', meta])

for (const ext of ['webp', 'png']) console.log(`poster.${ext}`, fs.statSync(`${out}.${ext}`).size, 'bytes')
