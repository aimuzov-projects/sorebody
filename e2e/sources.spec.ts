import { expect, test, type Locator, type Page } from '@playwright/test'

// Список источников длинный: виден первый источник с половиной второго и кнопка "Ещё N
// источников". Раскрывают его кнопка, поиск по странице и печать
const SLUG = 'rotator-cuff-tendinopathy'

/** Заголовок списка после прокрутки ниже шапки: toBeInViewport засчитал бы и спрятанный под ней. */
async function expectBelowHeader(page: Page) {
	await expect
		.poll(() =>
			page.evaluate(() => {
				const sources = document.querySelector('[data-sources]')!
				const title = sources.querySelector('h2')!.getBoundingClientRect().top
				const clear = parseFloat(getComputedStyle(sources).scrollMarginTop)

				return clear > 0 && title >= clear - 1
			}),
		)
		.toBe(true)
}

async function expectCollapsed(sources: Locator) {
	const items = sources.locator('.article__source')

	await expect(sources).toHaveAttribute('data-collapsed')
	await expect(items.nth(0)).toBeVisible()
	await expect(items.nth(1)).toBeVisible()
	await expect(items.nth(2)).toBeHidden()
	await expect(sources.getByRole('button', { name: /^Ещё \d+ источник/ })).toHaveAttribute('aria-expanded', 'false')
}

async function expectExpanded(sources: Locator) {
	await expect(sources).not.toHaveAttribute('data-collapsed')
	await expect(sources.locator('.article__source').last()).toBeVisible()
	await expect(sources.getByRole('button', { name: /^Ещё \d+ источник/ })).toBeHidden()
}

test('видны полтора источника, кнопка раскрывает весь список', async ({ page }) => {
	await page.goto(`/crossfit/${SLUG}/`)

	const sources = page.locator('[data-sources]')

	await expect(sources.locator('h2')).toContainText(/Источники\s+\d+/)
	await expect(sources).toContainText('из PubMed')
	await expectCollapsed(sources)

	await sources.getByRole('button', { name: /^Ещё \d+ источник/ }).click()
	await expectExpanded(sources)
})

test('без JS список виден целиком, кнопки нет', async ({ browser }) => {
	const page = await browser.newPage({ javaScriptEnabled: false })

	await page.goto(`/crossfit/${SLUG}/`)

	const sources = page.locator('[data-sources]')

	await expect(sources.locator('.article__source').last()).toBeVisible()
	await expect(sources.locator('.article__sources-more')).toBeHidden()
	await page.close()
})

test('скрытые источники находятся поиском по странице и раскрывают список', async ({ page }) => {
	await page.goto(`/crossfit/${SLUG}/`)

	const sources = page.locator('[data-sources]')

	await expectCollapsed(sources)
	// Совпадение поиском по странице браузер сообщает событием beforematch на скрытом элементе
	await sources.locator('.article__source').last().dispatchEvent('beforematch', { bubbles: true })
	await expectExpanded(sources)
})

test('сноски в тексте по-прежнему ведут на источник', async ({ page }) => {
	await page.goto(`/crossfit/${SLUG}/`)
	await expect(page.locator('.cite__link').first()).toHaveAttribute('href', /^https:\/\//)
})

test('ссылка с якорем #sources прокручивает к списку, заголовок не прячется под шапку', async ({ page }) => {
	await page.goto(`/crossfit/${SLUG}/#sources`)
	await expect(page.locator('[data-sources] h2')).toBeInViewport()
	await expectBelowHeader(page)
})

test('клик по ссылке #sources прокручивает к списку ниже шапки', async ({ page }) => {
	await page.goto(`/crossfit/${SLUG}/`)

	// Ссылки #sources в тексте пока нет: добавляем её в статью, как добавил бы автор
	await page.locator('.article__title').evaluate((title) => {
		const link = Object.assign(document.createElement('a'), { href: '#sources', textContent: 'к источникам' })

		link.dataset.testLink = ''
		title.after(link)
	})

	await page.locator('[data-test-link]').click()
	await expectBelowHeader(page)
})

test('перед печатью список раскрывается', async ({ page }) => {
	await page.goto(`/crossfit/${SLUG}/`)

	const sources = page.locator('[data-sources]')

	await expectCollapsed(sources)
	await page.evaluate(() => dispatchEvent(new Event('beforeprint')))
	await expectExpanded(sources)
})

test('в статье на главной источники тоже свёрнуты и раскрываются', async ({ page }) => {
	await page.goto(`/#${SLUG}`)

	const sources = page.locator('.reader:not(.theme-peek *) [data-sources]')

	await expectCollapsed(sources)
	await sources.getByRole('button', { name: /^Ещё \d+ источник/ }).click()
	await expectExpanded(sources)
	await expect(page).toHaveURL(new RegExp(`/crossfit/${SLUG}/$`))
})
