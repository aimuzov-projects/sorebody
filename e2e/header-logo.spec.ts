import { chromium, expect, test, type LaunchOptions, type Locator, type Page } from '@playwright/test'

const SLUG = 'acl-tear'

const opacity = (el: Locator) => el.evaluate((node) => Number(getComputedStyle(node).opacity))

test('в шапке статьи логотип уступает место заголовку при прокрутке и возвращается наверху', async ({ page }) => {
	await page.goto(`/crossfit/${SLUG}/`)

	const logo = page.locator('.site-header').getByRole('link', { name: 'Sorebody, на главную' })
	const title = page.locator('.article-bar__title')

	await expect(logo).toBeVisible()
	await expect(logo).toHaveAttribute('href', '/')
	expect(await opacity(title)).toBe(0)

	await page.evaluate(() => scrollTo(0, 400))
	await expect(logo).toBeHidden()
	await expect.poll(() => opacity(title)).toBe(1)

	await page.evaluate(() => scrollTo(0, 0))
	await expect(logo).toBeVisible()
	await expect.poll(() => opacity(title)).toBe(0)
})

test('в ридере на главной логотип прячется при прокрутке ридера и закрывает статью', async ({ page }) => {
	await page.goto(`/#${SLUG}`)

	const reader = page.locator('.reader:not(.theme-peek *)')
	const logo = reader.getByRole('link', { name: 'Sorebody, на главную' })
	const title = reader.locator('.article-bar__title')

	await expect(reader.locator('.article__title')).toBeVisible()
	await expect(logo).toBeVisible()

	await reader.evaluate((el) => el.scrollTo(0, 400))
	await expect(logo).toBeHidden()
	await expect.poll(() => opacity(title)).toBe(1)

	await reader.evaluate((el) => el.scrollTo(0, 0))
	await logo.click()
	await expect(reader).toHaveCount(0)
	// Как "Назад": статья закрыта, адрес вернулся к главной
	await expect(page).not.toHaveURL(new RegExp(`#${SLUG}$`))
})

test('заголовок в шапке статьи -- как «Назад»: с подсказкой и возвращает на страницу, откуда пришли', async ({
	page,
}) => {
	await page.goto('/about/')
	await page.getByRole('link', { name: 'Что нового' }).click()
	await page.waitForURL('**/changelog')

	const title = page.locator('.article-bar__title')

	await expect(title).toHaveAttribute('title', 'Назад')
	// Невидимый заголовок лежит поверх логотипа и не должен забирать его клики
	await expect(title).toBeHidden()

	await page.evaluate(() => scrollTo(0, 400))
	await expect.poll(() => opacity(title)).toBe(1)
	await title.click()
	await expect(page).toHaveURL(/\/about\/$/)
})

test('в ридере на главной заголовок в шапке закрывает статью', async ({ page }) => {
	await page.goto(`/#${SLUG}`)

	const reader = page.locator('.reader:not(.theme-peek *)')
	const title = reader.locator('.article-bar__title')

	await expect(reader.locator('.article__title')).toBeVisible()
	await reader.evaluate((el) => el.scrollTo(0, 400))
	await expect.poll(() => opacity(title)).toBe(1)
	await title.click()
	await expect(reader).toHaveCount(0)
	await expect(page).not.toHaveURL(new RegExp(`#${SLUG}$`))
})

test.describe('на узком телефоне', () => {
	test.use({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true })

	test('логотип и длинный заголовок не заходят под значки в углу и не раздвигают страницу', async ({ page }) => {
		await page.goto(`/crossfit/${SLUG}/`)

		// Самый левый значок ряда в углу. У .site-header справа отступ под эти значки, и
		// наложение на них сравнение с краем шапки не поймало бы
		const corner = (await page.getByRole('link', { name: 'О справочнике' }).boundingBox())!
		const logo = (await page.locator('.article-bar__logo').boundingBox())!

		expect(logo.x + logo.width).toBeLessThanOrEqual(corner.x)

		await page.evaluate(() => scrollTo(0, 400))

		const title = page.locator('.article-bar__title')

		await expect.poll(() => opacity(title)).toBe(1)
		expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

		const box = (await title.boundingBox())!

		expect(box.x + box.width).toBeLessThanOrEqual(corner.x)
	})
})

/** Левый край знака логотипа в шапке: на сцене, в ридере поверх неё и на странице статьи. */
async function logoXs(page: Page) {
	const mark = async (scope: string) => (await page.locator(`${scope} .logo__mark`).first().boundingBox())!.x
	const reader = '.reader:not(.theme-peek *)'

	await page.goto('/')
	const home = await mark('.site-header--floating')

	await page.goto(`/#${SLUG}`)
	await expect(page.locator(`${reader} .article__title`)).toBeVisible()
	const inReader = await mark(reader)

	await page.goto(`/crossfit/${SLUG}/`)
	const article = await mark('.site-header')

	return { home, reader: inReader, article }
}

// Полосы прокрутки: как у браузера по умолчанию, обычные (Windows) и скрытые, но с местом под
// полосу окна (так их рисует headless Chromium в CI на Linux). У ридера своя полоса, и колонка
// поверх сцены разъезжалась с отдельной страницей, когда её ширина не совпадала с местом у окна.
// Флаг отключает полосы поверх контента на macOS, в Linux он ничего не меняет. Браузер свой на
// каждый вариант: флаги запуска в test.use у группы не задать
const CLASSIC = ['--disable-features=OverlayScrollbar,OverlayScrollbars,MacOverlayScrollbars']
const SCROLLBARS: Record<string, LaunchOptions | undefined> = {
	'по умолчанию': undefined,
	обычные: { args: CLASSIC, ignoreDefaultArgs: ['--hide-scrollbars'] },
	скрытые: { args: CLASSIC },
}

for (const [bars, launchOptions] of Object.entries(SCROLLBARS))
	for (const width of [1280, 390])
		for (const telegram of [false, true])
			test(`полосы ${bars}, ${width}px${telegram ? ', Mini App' : ''}: логотип на главной, в ридере и у статьи в одной точке`, async ({
				browser,
				baseURL,
			}) => {
				const own = launchOptions && (await chromium.launch(launchOptions))
				const page = await (own ?? browser).newPage({ viewport: { width, height: 800 }, baseURL })

				// В Mini App своей «‹» нет: логотип везде на краю колонки, как поле шапки
				if (telegram) await page.addInitScript(() => sessionStorage.setItem('wodcare:tg', '1'))

				const { home, reader, article } = await logoXs(page)

				expect(Math.abs(home - article)).toBeLessThanOrEqual(1)
				expect(Math.abs(reader - article)).toBeLessThanOrEqual(1)

				if (telegram) {
					const frame = await page
						.locator('.site-header')
						.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))

					expect(Math.abs(article - frame)).toBeLessThanOrEqual(1)
				}

				await page.close()
				await own?.close()
			})
