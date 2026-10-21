import { expect, test, type Page } from '@playwright/test'

// Ссылка на статью главной (`/#slug`) открывает её сразу: без кадров с индексом главной, списком
// зоны и проявлением статьи. Анимации -- только у переходов, которые начал сам посетитель.
// Кадры пишем на каждом requestAnimationFrame с серверного HTML сцены, статья в них -- с гидрации;
// копии страницы в подсмотре темы (`.theme-peek`) не считаем
const SLUG = 'rotator-cuff-tendinopathy'
/** Сколько кадров ещё смотрим после появления статьи. */
const SETTLE = 20

type Frame = { index: boolean; zone: boolean; reader: number | null; hydrated: boolean }

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
					// Пока остров не гидрирован, у него атрибут ssr (Astro): статьи ещё нет, индекс спрятан
					hydrated: !document.querySelector('astro-island[ssr]:has(.body3d)'),
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

	// Вместо паузы наугад -- до тишины: анимации по времени на странице доиграли, и после
	// появления статьи записано ещё SETTLE кадров. Проявление или угасание главной, начнись оно,
	// попало бы в кадры. Не ждём бесконечных (подпись автора) и привязанных к прокрутке:
	// они «идут» всегда
	const seen = (await framesOf(page)).length

	await expect
		.poll(() =>
			page.evaluate(
				(min) =>
					(window as unknown as { frames: Frame[] }).frames.length >= min &&
					document
						.getAnimations()
						.every(
							(a) =>
								a.playState !== 'running' ||
								a.timeline !== document.timeline ||
								a.effect?.getTiming().iterations === Infinity,
						),
				seen + SETTLE,
			),
		)
		.toBe(true)

	const frames = await framesOf(page)

	const hydrated = frames.filter((f) => f.hydrated)

	expect(hydrated.length).toBeGreaterThan(0)
	expect(frames.filter((f) => f.index || f.zone)).toEqual([])
	expect(hydrated.filter((f) => f.reader !== 1)).toEqual([])
})

test('статья, открытая кликом, проявляется, а «Назад» возвращает к списку зоны', async ({ page }) => {
	await recordFrames(page)
	await page.goto('/#zone=shoulder:0')
	await page.locator('.zone .zone__item').first().click()
	await expect(page).toHaveURL(/\/crossfit\/[\w-]+\/$/)
	await expect(page.locator('.reader .article__title')).toBeVisible()

	const frames = await framesOf(page)

	// Проявление: хотя бы один кадр со статьёй ещё не в полную силу
	expect(frames.some((f) => f.reader !== null && f.reader < 1)).toBe(true)

	await page.locator('.reader__back').click()
	await expect(page).toHaveURL(/#zone=shoulder:0$/)
	await expect(page.locator('.zone')).toBeVisible()
	await expect(page.locator('.reader')).toHaveCount(0)
})

// Статья в ридере гаснет полсекунды: строка «Разбор в ...» с переключателем спорта
// гаснет вместе с ней, а не пропадает в первом кадре, пока статья ещё видна
test('переключатель спорта в статье уходит вместе со статьёй, а не раньше', async ({ page }) => {
	await page.goto('/')
	await page.locator('.index__zones').waitFor()
	await page.evaluate(() => (location.hash = '#ankle-sprain'))

	const reader = page.locator('.reader:not(.theme-peek *)')
	const switcher = reader.locator('[data-sport-switch] button')

	await expect(switcher).toBeVisible()
	await page.goBack()
	await page.waitForTimeout(150)
	await expect(reader).toHaveCount(1)
	await expect(switcher).toHaveCount(1)
	await expect(reader).toHaveCount(0)
})

// Хеш не уходит на сервер: по старой ссылке `/basketball/#concussion` превью и поисковики видят мету
// главной. Статья поверх модели живёт под путём своей страницы, старую ссылку адрес сразу меняет
test('старая ссылка на статью хешем открывает её под путём статьи, «Назад» -- к её зоне', async ({ page }) => {
	await page.goto('/basketball/#concussion')
	await expect(page).toHaveURL(/\/basketball\/concussion\/$/)
	await expect(page.locator('.reader .article__title')).toBeVisible()
	await page.locator('.reader__back').click()
	await expect(page).toHaveURL(/\/basketball\/#zone=[\w-]+:\d$/)
	await expect(page.locator('.zone')).toBeVisible()
})
