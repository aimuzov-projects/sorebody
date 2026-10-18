import { expect, test, type Page } from '@playwright/test'

// Ссылка на статью главной (`/#slug`) открывает её сразу: без кадров с индексом главной, списком
// зоны и проявлением статьи. Анимации -- только у переходов, которые начал сам посетитель.
// Кадры пишем на каждом requestAnimationFrame с монтирования сцены; копии страницы в подсмотре
// темы (`.theme-peek`) не считаем
const SLUG = 'rotator-cuff-tendinopathy'

type Frame = { index: boolean; zone: boolean; reader: number | null }

async function recordFrames(page: Page) {
	await page.addInitScript(() => {
		const frames: Frame[] = []
		const own = (selector: string) => document.querySelector<HTMLElement>(`${selector}:not(.theme-peek *)`)
		const shown = (el: HTMLElement | null) =>
			!!el && el.checkVisibility({ opacityProperty: true, visibilityProperty: true })

		const frame = () => {
			if (own('.body3d')) {
				const reader = own('.reader')

				frames.push({
					index: shown(own('.index')),
					zone: shown(own('.zone')),
					reader: reader ? Number(getComputedStyle(reader).opacity) : null,
				})
			}

			requestAnimationFrame(frame)
		}

		requestAnimationFrame(frame)
		Object.assign(window, { frames })
	})
}

const framesOf = (page: Page) => page.evaluate(() => (window as unknown as { frames: Frame[] }).frames)

test('прямой заход по ссылке на статью: статья с первого кадра, главной и анимаций нет', async ({ page }) => {
	// Медленный телефон: на быстрой машине промежуточные кадры проскакивают между rAF
	const cdp = await page.context().newCDPSession(page)

	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
	await recordFrames(page)
	await page.goto(`/#${SLUG}`)
	await expect(page.locator('.reader .article__title')).toBeVisible()
	await page.waitForTimeout(800)

	const frames = await framesOf(page)

	expect(frames.length).toBeGreaterThan(0)
	expect(frames[0].reader).toBe(1)
	expect(frames.filter((f) => f.index || f.zone)).toEqual([])
	expect(frames.filter((f) => f.reader !== 1)).toEqual([])
})

test('статья, открытая кликом, проявляется, а «Назад» возвращает к списку зоны', async ({ page }) => {
	await recordFrames(page)
	await page.goto('/#zone=shoulder:0')
	await page.locator('.zone .zone__item').first().click()
	await expect(page).toHaveURL(/#[\w-]+$/)
	await expect(page.locator('.reader .article__title')).toBeVisible()

	const frames = await framesOf(page)

	// Проявление: хотя бы один кадр со статьёй ещё не в полную силу
	expect(frames.some((f) => f.reader !== null && f.reader < 1)).toBe(true)

	await page.locator('.reader__back').click()
	await expect(page).toHaveURL(/#zone=shoulder:0$/)
	await expect(page.locator('.zone')).toBeVisible()
	await expect(page.locator('.reader')).toHaveCount(0)
})
