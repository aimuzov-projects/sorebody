import { expect, test } from '@playwright/test'

// Этап 0 многоспортивного справочника (docs/multisport-concept.md): кроссфит переехал под
// `/crossfit/`, старые адреса ведут туда же, раздел статьи и зона сцены в хеше не теряются
test('старый адрес статьи ведёт на статью кроссфита к тому же разделу', async ({ page }) => {
	await page.goto('/injuries/acl-tear/#urgent')
	await expect(page).toHaveURL(/\/crossfit\/acl-tear\/#urgent$/)
	await expect(page.locator('.article__title')).toBeVisible()
})

// Основной поток на старые адреса -- из поисковика. После переадресации «Назад» ведёт на главную,
// а не обратно в поисковик: страница статьи не должна считать, что пришла с сайта
test('из поисковика по старому адресу «Назад» в статье ведёт на главную', async ({ page }) => {
	await page.goto('about:blank')
	await page.goto('/injuries/acl-tear/', { referer: 'https://www.google.com/' })
	await expect(page).toHaveURL(/\/crossfit\/acl-tear\/$/)
	await page.locator('[data-back]').click()
	await expect(page).toHaveURL(/\/$/)
	await expect(page.locator('.index__title--home')).toBeVisible()
})

test('старый адрес движения ведёт на страницу элемента кроссфита', async ({ page }) => {
	await page.goto('/movements/burpee/')
	await expect(page).toHaveURL(/\/crossfit\/elements\/burpee\/$/)
	await expect(page.locator('.index__title')).toHaveText('Бёрпи')
})

// Цвет спорта задаёт правило :root[data-sport='crossfit'] в global.css. Без спорта цвет пока тот же,
// поэтому подкладываем свой цвет в :root: правило спорта сильнее и должно его перебить
test('страницы спорта красят акцент цветом спорта, страницы без спорта -- нет', async ({ page }) => {
	const accent = () =>
		page.evaluate(() => {
			const sheet = new CSSStyleSheet()

			sheet.replaceSync(':root { --accent-light: #123456; --accent-dark: #123456 }')
			document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]

			const probe = document.body.appendChild(document.createElement('i'))

			probe.style.color = 'var(--accent)'

			return getComputedStyle(probe).color
		})

	for (const path of ['/', '/crossfit/', '/crossfit/acl-tear/', '/crossfit/elements/burpee/']) {
		await page.goto(path)
		await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')
		expect(await accent(), path).toBe('rgb(0, 102, 204)')
	}

	await page.goto('/about/')
	await expect(page.locator('html')).not.toHaveAttribute('data-sport')
	expect(await accent()).toBe('rgb(18, 52, 86)')
})

test('главная спорта по умолчанию живёт и на /crossfit/, canonical -- на /', async ({ page }) => {
	await page.goto('/crossfit/')
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/$/)
	await expect(page.locator('link[rel="canonical"]')).not.toHaveAttribute('href', /crossfit/)
	await expect(page.locator('.index__title--home')).toBeVisible()
})

// Этап 2: второй спорт. Селект в заголовке главной -- поверх фразы спорта, виден на общем плане.
// Смена ведёт на главную другого спорта и везёт с собой последнюю зону вместе со стороной тела
test('падел красит акцент лаймом, а селект в заголовке переключает спорт с зоной', async ({ page }) => {
	await page.goto('/padel/#zone=shoulder:1')
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'padel')
	await expect(page.locator('h1')).toHaveText('Травмы в паделе')
	await expect(page.locator('.index__sport')).toHaveCSS('color', 'rgb(70, 117, 9)')
	await page.locator('.zone__back').click()

	const select = page.getByRole('combobox', { name: 'Вид спорта' })

	await expect(select).toHaveValue('padel')
	// click() проверяет, что селект можно нажать: не под inert-панелью и не прозрачным
	await select.click()
	await select.selectOption('crossfit')
	await expect(page).toHaveURL(/\/#zone=shoulder:1$/)
})

test('после «Назад» селект снова на своём спорте', async ({ page }) => {
	await page.goto('/padel/')
	await page.getByRole('combobox', { name: 'Вид спорта' }).selectOption('crossfit')
	await expect(page).toHaveURL(/\/$/)
	await page.goBack()
	await expect(page).toHaveURL(/\/padel\/$/)
	await expect(page.getByRole('combobox', { name: 'Вид спорта' })).toHaveValue('padel')
})

// Голова и голень есть только у травм падела: у кроссфита пустых зон в списке нет
test('на странице спорта видны только зоны с его травмами', async ({ page }) => {
	await page.goto('/padel/?scene')
	await expect(page.locator('.index__zone-label', { hasText: 'Голень' })).toBeVisible()
	await page.goto('/crossfit/?scene')
	await expect(page.locator('.index__zone-label', { hasText: 'Голень' })).toHaveCount(0)
})

test('селект «Разбор в …» ведёт на статью другого спорта к тому же разделу', async ({ page }) => {
	await page.goto('/crossfit/ankle-sprain/')
	await page.locator('#treatment').scrollIntoViewIfNeeded()
	await page.evaluate(() => document.querySelector('#treatment')?.scrollIntoView())
	await page.getByRole('combobox', { name: 'Разбор по виду спорта' }).selectOption({ label: 'Падел' })
	await expect(page).toHaveURL(/\/padel\/ankle-sprain\/#treatment$/)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'padel')
})

test('у травмы одного спорта вместо селекта -- текст', async ({ page }) => {
	await page.goto('/crossfit/acl-tear/')
	await expect(page.locator('.article__sport')).toHaveText('Разбор в кроссфите')
	await expect(page.locator('[data-sport-select]')).toHaveCount(0)
})

// У травм двух спортов /injuries/<slug>/ -- общая страница. Старые ссылки кроссфита на разделы
// линзы она уводит туда, где эти разделы есть
test('старая ссылка на раздел линзы с общей страницы ведёт в статью кроссфита', async ({ page }) => {
	await page.goto('/injuries/ankle-sprain/#adapt')
	await expect(page).toHaveURL(/\/crossfit\/ankle-sprain\/#adapt$/)

	await page.goto('/injuries/ankle-sprain/#treatment')
	await expect(page).toHaveURL(/\/injuries\/ankle-sprain\/#treatment$/)
})
