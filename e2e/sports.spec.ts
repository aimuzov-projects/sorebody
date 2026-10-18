import { expect, test, type Page } from '@playwright/test'

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

// Этап 2: второй спорт. Выбор спорта в заголовке главной -- кнопка-фраза со списком, как у фильтра
// движения, видна на общем плане. Выбор ведёт на главную другого спорта и везёт последнюю зону
// вместе со стороной тела
const sportButton = (page: Page, title: string) => page.getByRole('button', { name: `Вид спорта ${title}` })

test('падел красит акцент лаймом, а выбор спорта в заголовке переносит зону', async ({ page }) => {
	await page.goto('/padel/#zone=shoulder:1')
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'padel')
	await expect(page.locator('h1')).toHaveText('Травмы в паделе')
	await page.locator('.zone__back').click()

	const button = sportButton(page, 'Падел')

	await expect(button).toHaveCSS('color', 'rgb(70, 117, 9)')
	// click() упадёт, если кнопку нельзя нажать: под inert-панелью, скрыта или прозрачна
	await button.click()
	await page.getByRole('option', { name: 'Кроссфит' }).click()
	await expect(page).toHaveURL(/\/#zone=shoulder:1$/)
})

test('выбор спорта с клавиатуры: стрелка двигает подсветку, Enter переходит, Escape закрывает', async ({ page }) => {
	await page.goto('/')

	const button = sportButton(page, 'Кроссфит')

	await button.focus()
	await page.keyboard.press('ArrowDown')
	await expect(page.getByRole('listbox')).toBeVisible()
	await page.keyboard.press('ArrowDown')
	await expect(page).toHaveURL(/\/$/)
	await page.keyboard.press('Escape')
	await expect(page.getByRole('listbox')).toHaveCount(0)
	await expect(page).toHaveURL(/\/$/)

	await page.keyboard.press('ArrowDown')
	await page.keyboard.press('ArrowDown')
	await page.keyboard.press('Enter')
	await expect(page).toHaveURL(/\/padel\/$/)
})

test('после «Назад» список закрыт и показывает свой спорт', async ({ page }) => {
	await page.goto('/padel/')
	await sportButton(page, 'Падел').click()
	await page.getByRole('option', { name: 'Кроссфит' }).click()
	await expect(page).toHaveURL(/\/$/)
	await page.goBack()
	await expect(page).toHaveURL(/\/padel\/$/)
	await expect(sportButton(page, 'Падел')).toHaveAttribute('aria-expanded', 'false')
	await expect(page.getByRole('listbox')).toHaveCount(0)
})

// Голова и голень есть только у травм падела: у кроссфита пустых зон в списке нет
test('на странице спорта видны только зоны с его травмами', async ({ page }) => {
	await page.goto('/padel/?scene')
	await expect(page.locator('.index__zone-label', { hasText: 'Голень' })).toBeVisible()
	await page.goto('/crossfit/?scene')
	await expect(page.locator('.index__zone-label', { hasText: 'Голень' })).toHaveCount(0)
})

test('«Разбор в …» ведёт на статью другого спорта к тому же разделу', async ({ page }) => {
	await page.goto('/crossfit/ankle-sprain/')
	await page.locator('[data-sport-switch] astro-island:not([ssr])').waitFor({ state: 'attached' })
	await page.evaluate(() => document.querySelector('#treatment')?.scrollIntoView())
	// Фокус без прокрутки: читатель остаётся в разделе «Лечение»
	await sportButton(page, 'Кроссфит').evaluate((el: HTMLElement) => el.focus({ preventScroll: true }))
	await page.keyboard.press('Enter')
	await page.keyboard.press('ArrowDown')
	await page.keyboard.press('Enter')
	await expect(page).toHaveURL(/\/padel\/ankle-sprain\/#treatment$/)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'padel')
})

test('у травмы одного спорта вместо селекта -- текст', async ({ page }) => {
	await page.goto('/crossfit/acl-tear/')
	await expect(page.locator('.article__sport')).toHaveText('Разбор в кроссфите')
	await expect(page.locator('[data-sport-switch]')).toHaveCount(0)
})

// У травм двух спортов /injuries/<slug>/ -- общая страница. Старые ссылки кроссфита на разделы
// линзы она уводит туда, где эти разделы есть
test('старая ссылка на раздел линзы с общей страницы ведёт в статью кроссфита', async ({ page }) => {
	await page.goto('/injuries/ankle-sprain/#adapt')
	await expect(page).toHaveURL(/\/crossfit\/ankle-sprain\/#adapt$/)

	await page.goto('/injuries/ankle-sprain/#treatment')
	await expect(page).toHaveURL(/\/injuries\/ankle-sprain\/#treatment$/)
})
