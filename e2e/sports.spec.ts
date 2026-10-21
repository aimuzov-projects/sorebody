import { expect, test, type Page } from '@playwright/test'

import { sportOf, SPORTS, type SportSlug } from '#frontend/data/sports.ts'

const CROSSFIT = sportOf('crossfit')
const PADEL = sportOf('padel')
const FOOTBALL = sportOf('football')
const RUNNING = sportOf('running')
const BASKETBALL = sportOf('basketball')

/** `#0066cc` -> `rgb(0, 102, 204)`: так цвет отдаёт getComputedStyle. */
const rgb = (hex: string) => `rgb(${(hex.slice(1).match(/../g) ?? []).map((pair) => parseInt(pair, 16)).join(', ')})`

// Этап 0 многоспортивного справочника (docs/multisport-concept.md): кроссфит переехал под
// `/crossfit/`, старые адреса ведут туда же, раздел статьи и зона сцены в хеше не теряются
test('старый адрес статьи ведёт на статью кроссфита к тому же разделу', async ({ page }) => {
	await page.goto('/injuries/distal-biceps-rupture/#urgent')
	await expect(page).toHaveURL(/\/crossfit\/distal-biceps-rupture\/#urgent$/)
	await expect(page.locator('.article__title')).toBeVisible()
})

// Основной поток на старые адреса -- из поисковика. После переадресации «Назад» ведёт на главную,
// а не обратно в поисковик: страница статьи не должна считать, что пришла с сайта
test('из поисковика по старому адресу «Назад» в статье ведёт на главную', async ({ page }) => {
	await page.goto('about:blank')
	await page.goto('/injuries/distal-biceps-rupture/', { referer: 'https://www.google.com/' })
	await expect(page).toHaveURL(/\/crossfit\/distal-biceps-rupture\/$/)
	await page.getByRole('link', { name: 'Назад' }).click()
	await expect(page).toHaveURL(/\/$/)
	await expect(page.locator('.index__title--home')).toBeVisible()
})

test('старый адрес движения ведёт на страницу элемента кроссфита', async ({ page }) => {
	await page.goto('/movements/burpee/')
	await expect(page).toHaveURL(/\/crossfit\/elements\/burpee\/$/)
	await expect(page.locator('.index__title')).toHaveText('Бёрпи')
})

// Цвет спорта задаёт правило :root[data-sport='crossfit'] в global.css. Без спорта цвет пока тот же,
// поэтому подкладываем свой цвет в :root: правило спорта сильнее и должно его перебить. Без
// перехода: смена цвета акцента плавная (global.css), а проверка -- сразу
test('страницы спорта красят акцент цветом спорта, страницы без спорта -- нет', async ({ page }) => {
	const accent = () =>
		page.evaluate(() => {
			const sheet = new CSSStyleSheet()

			sheet.replaceSync(':root { --accent-light: #123456; --accent-dark: #123456; transition: none }')
			document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]

			const probe = document.body.appendChild(document.createElement('i'))

			probe.style.color = 'var(--accent)'

			return getComputedStyle(probe).color
		})

	for (const path of ['/', '/crossfit/', '/crossfit/acl-tear/', '/crossfit/elements/burpee/']) {
		await page.goto(path)
		await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')
		expect(await accent(), path).toBe(rgb(CROSSFIT.accent.light))
	}

	await page.goto('/about/')
	await expect(page.locator('html')).not.toHaveAttribute('data-sport')
	expect(await accent()).toBe(rgb('#123456'))
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

// Стрелками от спорта `from` к `to` в открытом списке: шагов столько, сколько между ними в SPORTS.
// Подсветку сверяем по имени, а не по числу нажатий
async function highlight(page: Page, from: SportSlug, to: SportSlug) {
	const steps = SPORTS.findIndex((s) => s.slug === to) - SPORTS.findIndex((s) => s.slug === from)
	const list = page.getByRole('listbox')

	for (let i = 0; i < Math.abs(steps); i++) await page.keyboard.press(steps > 0 ? 'ArrowDown' : 'ArrowUp')

	const target = await list.getByRole('option', { name: sportOf(to).title }).getAttribute('id')

	await expect(list).toHaveAttribute('aria-activedescendant', target!)
}

test('падел красит акцент лаймом, а выбор спорта с общего плана открывает общий план', async ({ page }) => {
	await page.goto('/padel/#zone=shoulder:1')
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'padel')
	await expect(page.locator('h1')).toHaveText('Боль в паделе')
	await page.locator('.zone__back').click()

	const button = sportButton(page, 'Падел')

	await expect(button).toHaveCSS('color', rgb(PADEL.accent.light))
	// click() упадёт, если кнопку нельзя нажать: под inert-панелью, скрыта или прозрачна
	await button.click()
	await page.getByRole('option', { name: 'Кроссфит' }).click()
	// Закрытая зона сама не открывается: смена спорта оставляет общий план
	await expect(page).toHaveURL(/\/\/[^/]+\/$/)
	await expect(page.locator('.zone')).toHaveCount(0)
})

test('выбор спорта с клавиатуры: стрелка двигает подсветку, Enter переходит, Escape закрывает', async ({ page }) => {
	await page.goto('/')

	const button = sportButton(page, 'Кроссфит')

	await button.focus()
	await page.keyboard.press('ArrowDown')
	await expect(page.getByRole('listbox')).toBeVisible()
	await highlight(page, 'crossfit', 'padel')
	await expect(page).toHaveURL(/\/$/)
	await page.keyboard.press('Escape')
	await expect(page.getByRole('listbox')).toHaveCount(0)
	await expect(page).toHaveURL(/\/$/)

	await page.keyboard.press('ArrowDown')
	await highlight(page, 'crossfit', 'padel')
	await page.keyboard.press('Enter')
	await expect(page).toHaveURL(/\/padel\/$/)
})

// Спорт -- настройка, а не шаг: смена не добавляет запись в историю, список после выбора закрыт
test('смена спорта не добавляет шаг в историю', async ({ page }) => {
	await page.goto('/padel/')

	const steps = () => page.evaluate(() => history.length)
	const before = await steps()

	await sportButton(page, 'Падел').click()
	await page.getByRole('option', { name: 'Кроссфит' }).click()
	await expect(page).toHaveURL(/\/$/)
	await expect(sportButton(page, 'Кроссфит')).toHaveAttribute('aria-expanded', 'false')
	await expect(page.getByRole('listbox')).toHaveCount(0)
	expect(await steps()).toBe(before)
})

// Смена спорта на главной -- на месте: страница и сцена с моделью остаются, меняются данные спорта,
// адрес, заголовки и цвет. Метки на window и на холсте переживут только такую смену
async function markPage(page: Page) {
	// Остров сцены монтируется на клиенте: до него холста ещё нет
	await page.locator('.body3d__canvas').waitFor({ state: 'attached' })

	await page.evaluate(() => {
		Object.assign(window, { samePage: true })
		document.querySelector('.body3d__canvas')?.setAttribute('data-same', '')
	})
}

const samePage = (page: Page) =>
	page.evaluate(() => 'samePage' in window && document.querySelector('.body3d__canvas[data-same]') !== null)

async function chooseSport(page: Page, from: string, to: string) {
	await sportButton(page, from).click()
	await page.getByRole('option', { name: to }).click()
}

// Третий спорт: из падела в футбол на месте, цвет перетекает из лайма в зелёный, а локоть, который
// есть только у падела, уходит со списка зон
test('из падела в футбол -- на месте, со своим цветом и своими зонами', async ({ page }) => {
	await page.goto('/padel/')
	await markPage(page)
	await chooseSport(page, 'Падел', 'Футбол')

	await expect(page).toHaveURL(/\/football\/$/)
	await expect(page.locator('h1')).toHaveText('Боль в футболе')
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'football')
	await expect(sportButton(page, 'Футбол')).toHaveCSS('color', rgb(FOOTBALL.accent.light))
	await expect(page.locator('.index__zone-label', { hasText: 'Локоть' })).toHaveCount(0)
	await expect(page.locator('.index__zone-label', { hasText: 'Голова' })).toHaveCount(1)
	expect(await samePage(page)).toBe(true)
})

// Четвёртый спорт: из футбола в бег на месте, зелёный перетекает в оранжевый. Головы и плеча
// у бега нет, а голень остаётся: её травмы есть у обоих спортов
test('из футбола в бег -- на месте, со своим цветом и своими зонами', async ({ page }) => {
	await page.goto('/football/')
	await markPage(page)
	await chooseSport(page, 'Футбол', 'Бег')

	await expect(page).toHaveURL(/\/running\/$/)
	await expect(page.locator('h1')).toHaveText('Боль в беге')
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'running')
	await expect(sportButton(page, 'Бег')).toHaveCSS('color', rgb(RUNNING.accent.light))
	await expect(page.locator('.index__zone-label', { hasText: 'Голова' })).toHaveCount(0)
	await expect(page.locator('.index__zone-label', { hasText: 'Плечо' })).toHaveCount(0)
	await expect(page.locator('.index__zone-label', { hasText: 'Голень' })).toHaveCount(1)
	expect(await samePage(page)).toBe(true)
})

test('страница нагрузки бега собирает её травмы', async ({ page }) => {
	await page.goto('/running/elements/downhill/')
	await expect(page.locator('.index__title')).toHaveText('Бег под гору')
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'running')
	await expect(page.locator('a[href="/running/iliotibial-band-syndrome/"]').first()).toBeAttached()
})

// Пятый спорт: из бега в баскетбол на месте, оранжевый перетекает в фиолетовый. У баскетбола есть
// голова (сотрясение, лицо, глаз) и кисть, которых у бега нет
test('из бега в баскетбол -- на месте, со своим цветом и своими зонами', async ({ page }) => {
	await page.goto('/running/')
	await markPage(page)
	await chooseSport(page, 'Бег', 'Баскетбол')

	await expect(page).toHaveURL(/\/basketball\/$/)
	await expect(page.locator('h1')).toHaveText('Боль в баскетболе')
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'basketball')
	await expect(sportButton(page, 'Баскетбол')).toHaveCSS('color', rgb(BASKETBALL.accent.light))
	await expect(page.locator('.index__zone-label', { hasText: 'Голова' })).toHaveCount(1)
	await expect(page.locator('.index__zone-label', { hasText: 'Запястье и кисть' })).toHaveCount(1)
	expect(await samePage(page)).toBe(true)
})

test('страница ситуации баскетбола собирает её травмы', async ({ page }) => {
	await page.goto('/basketball/elements/landing-on-foot/')
	await expect(page.locator('.index__title')).toHaveText('Приземление на стопу соперника')
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'basketball')
	await expect(page.locator('a[href="/basketball/ankle-sprain/"]').first()).toBeAttached()
})

// Адрес главной кроссфита: `/` без пути, `/padel/` под /\/$/ тоже подходит
const HOME = /\/\/[^/]+\/$/

test('смена спорта на главной не перезагружает страницу и не добавляет шаг', async ({ page }) => {
	await page.goto('/')
	await markPage(page)
	await chooseSport(page, 'Кроссфит', 'Падел')

	await expect(page).toHaveURL(/\/padel\/$/)
	await expect(page.locator('h1')).toHaveText('Боль в паделе')
	await expect(page).toHaveTitle(/^Боль в паделе/)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'padel')
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/padel\/$/)
	// Цвет перетекает, ждём, пока он дойдёт до лайма
	await expect(sportButton(page, 'Падел')).toHaveCSS('color', rgb(PADEL.accent.light))
	await expect(page.locator('.index__zone-label', { hasText: 'Голень' })).toHaveCount(1)
	expect(await samePage(page)).toBe(true)

	// Шаг в зону и обратно -- в паделе, браузерный «Назад» к кроссфиту не возвращает
	await page.locator('.index__zone', { hasText: 'Колено' }).click()
	await expect(page).toHaveURL(/\/padel\/#zone=knee:\d$/)
	await page.goBack()
	await expect(page).toHaveURL(/\/padel\/$/)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'padel')
	expect(await samePage(page)).toBe(true)

	// Обновление -- обычная статическая страница падела
	await page.reload()
	await expect(page.locator('h1')).toHaveText('Боль в паделе')
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'padel')
	expect(await samePage(page)).toBe(false)
})

// Статья -> «Разбор» в другом спорте -> «Назад» до общего плана -> выбор спорта в заголовке:
// остаёмся на общем плане, а не в зоне статьи, которую уже закрыли
test('после «Назад» из статьи выбор спорта в заголовке не открывает закрытую зону', async ({ page }) => {
	await page.goto('/')
	await markPage(page)
	await page.locator('.index__zone', { hasText: 'Голова' }).click()
	await page.locator('.zone .zone__item', { hasText: 'Травмы лица' }).click()

	const reader = page.locator('.reader:not(.theme-peek *)')

	await reader.locator('[data-sport-switch] button').click()
	await page.getByRole('option', { name: 'Падел' }).click()
	await expect(page).toHaveURL(/\/padel\/#orofacial-trauma$/)
	await reader.locator('.reader__back').click()
	await page.locator('.zone__back').click()
	await expect(page).toHaveURL(/\/padel\/$/)
	// Статья гаснет полсекунды: её «Разбор» тоже кнопка «Вид спорта», ждём, пока уйдёт
	await expect(reader).toHaveCount(0)

	await chooseSport(page, 'Падел', 'Кроссфит')
	await expect(page).toHaveURL(HOME)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')
	await expect(page.locator('.zone')).toHaveCount(0)
	expect(await samePage(page)).toBe(true)
})

// «Разбор ‹в …›» в статье поверх модели -- та же смена спорта, что в заголовке: сцена остаётся,
// статья -- с разбором нового спорта, а все прошлые шаги («Назад» на странице и в браузере)
// открываются уже в нём
test('«Разбор в …» в статье на главной меняет спорт на месте, «Назад» ведёт в зону нового спорта', async ({ page }) => {
	await page.goto('/football/')
	await markPage(page)
	await page.locator('.index__zone', { hasText: 'Голова' }).click()
	await expect(page).toHaveURL(/\/football\/#zone=head:\d$/)
	await page.locator('.zone .zone__item', { hasText: 'Травмы лица' }).click()
	await expect(page).toHaveURL(/\/football\/#orofacial-trauma$/)

	const reader = page.locator('.reader:not(.theme-peek *)')

	await reader.locator('[data-sport-switch] button').click()
	await page.getByRole('option', { name: 'Кроссфит' }).click()

	await expect(page).toHaveURL(/\/\/[^/]+\/#orofacial-trauma$/)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')
	await expect(reader.locator('.article__sport')).toHaveText(/в\sкроссфите/)
	expect(await samePage(page)).toBe(true)

	await reader.locator('.reader__back').click()
	await expect(page).toHaveURL(/\/\/[^/]+\/#zone=head:\d$/)
	await expect(page.locator('.zone__title')).toHaveText('Голова')
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')

	await page.goBack()
	await expect(page).toHaveURL(HOME)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')

	await page.goForward()
	await page.goForward()
	await expect(page).toHaveURL(/\/\/[^/]+\/#orofacial-trauma$/)
	await expect(reader.locator('.article__sport')).toHaveText(/в\sкроссфите/)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')
	expect(await samePage(page)).toBe(true)
})

test('«Разбор в …» в статье на главной открывает новый разбор на том же разделе', async ({ page }) => {
	await page.goto('/#ankle-sprain')

	const reader = page.locator('.reader:not(.theme-peek *)')
	const section = reader.locator('#treatment')

	await section.evaluate((el) => el.scrollIntoView({ block: 'start' }))
	// Фокус без прокрутки, выбор с клавиатуры: клик мышью сначала прокрутил бы к кнопке
	await reader.locator('[data-sport-switch] button').evaluate((el: HTMLElement) => el.focus({ preventScroll: true }))
	await page.keyboard.press('Enter')
	await highlight(page, 'crossfit', 'padel')
	await page.keyboard.press('Enter')

	await expect(page).toHaveURL(/\/padel\/#ankle-sprain$/)
	await expect(reader.locator('.article__sport')).toHaveText(/в\sпаделе/)

	await expect
		.poll(() => section.evaluate((el) => Math.round(el.getBoundingClientRect().top)))
		.toBeLessThan(await page.evaluate(() => innerHeight / 3))
})

// Разбор другого спорта грузится поверх показанной статьи: строка «Разбор» не пропадает на время
// загрузки, название и она стоят на месте, прокрученная статья не уезжает в начало. Ответ задержан:
// на локальном сервере статья приходит раньше, чем заготовка успела бы мелькнуть
// Пока статья грузится, заготовка уже рисует селект спорта: раньше там стоял текст без шеврона,
// и при подмене строка «Разбор» мигала
test('строка «Разбор» в заготовке статьи та же, что в загруженной', async ({ page }) => {
	let release = () => {}
	const held = new Promise<void>((resolve) => (release = resolve))

	await page.route(/\/crossfit\/ankle-sprain\/$/, async (route) => {
		await held
		await route.continue()
	})

	await page.goto('/#ankle-sprain')

	const reader = page.locator('.reader:not(.theme-peek *)')
	const line = reader.locator('.article__sport').first()
	const box = () => line.evaluate((el) => el.getBoundingClientRect().toJSON())

	await expect(reader).toHaveAttribute('aria-busy', 'true')
	await expect(line.locator('.pselect__chevron')).toBeVisible()

	const before = await box()

	release()
	await expect(reader).toHaveAttribute('aria-busy', 'false')
	await expect(reader.locator('[data-sport-switch] button')).toBeVisible()
	expect(await box()).toEqual(before)
})

for (const scrolled of [false, true])
	test(`смена спорта в статье на главной не сдвигает страницу (${scrolled ? 'в середине статьи' : 'в начале'})`, async ({
		page,
	}) => {
		await page.goto('/#ankle-sprain')

		const reader = page.locator('.reader:not(.theme-peek *)')
		const button = reader.locator('[data-sport-switch] button')

		await button.waitFor()

		if (scrolled) await reader.locator('#treatment').evaluate((el) => el.scrollIntoView({ block: 'start' }))

		await page.route(/\/padel\/ankle-sprain\/$/, async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 400))
			await route.continue()
		})

		const place = () =>
			reader.evaluate((root) => {
				const top = (selector: string) => Math.round(root.querySelector(selector)!.getBoundingClientRect().top)

				return {
					title: top('.article__title'),
					sport: top('.article__sport'),
					scroll: Math.round(root.scrollTop),
				}
			})
		const before = await place()

		// Кадр за кадром до подмены: строка «Разбор» видна и не двигается
		await reader.evaluate((root) => {
			const frames: number[][] = []

			Object.assign(window, { lensFrames: frames })

			const tick = () => {
				const line = root.querySelector('.article__sport')!.getBoundingClientRect()

				frames.push([Math.round(line.top), Math.round(line.height)])

				if (!root.querySelector('.article__sport')?.textContent?.includes('паделе')) requestAnimationFrame(tick)
			}

			tick()
		})

		await button.evaluate((el: HTMLElement) => el.focus({ preventScroll: true }))
		await page.keyboard.press('Enter')
		await highlight(page, 'crossfit', 'padel')
		await page.keyboard.press('Enter')
		await expect(reader.locator('.article__sport')).toHaveText(/в\sпаделе/)

		const frames = await page.evaluate(() => (window as unknown as { lensFrames: number[][] }).lensFrames)

		expect(frames.length).toBeGreaterThan(5)

		for (const [top, height] of frames.slice(0, -1)) {
			expect(height).toBeGreaterThan(0)
			expect(top).toBe(before.sport)
		}

		// Начало статьи -- на месте; из середины -- снова в «Лечении», а не в начале
		if (scrolled)
			await expect
				.poll(() => reader.locator('#treatment').evaluate((el) => Math.round(el.getBoundingClientRect().top)))
				.toBeLessThan(await page.evaluate(() => innerHeight / 3))
		else expect(await place()).toEqual(before)
	})

for (const reducedMotion of ['no-preference', 'reduce'] as const)
	test(`цвет спорта при смене ${reducedMotion === 'reduce' ? 'меняется сразу' : 'перетекает'} (${reducedMotion})`, async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion })
		await page.goto('/')

		await page.evaluate(() => {
			const started: string[] = []

			document.documentElement.addEventListener('transitionstart', (event) => started.push(event.propertyName))
			Object.assign(window, { started })
		})

		await chooseSport(page, 'Кроссфит', 'Падел')
		await expect(page.locator('html')).toHaveAttribute('data-sport', 'padel')
		await expect(sportButton(page, 'Падел')).toHaveCSS('color', rgb(PADEL.accent.light))

		const started = await page.evaluate(() => (window as unknown as { started: string[] }).started)

		expect(started.includes('--accent-light')).toBe(reducedMotion === 'no-preference')
	})

test('смена спорта сбрасывает поиск, частоту и движение', async ({ page }) => {
	await page.goto('/')
	await page.getByRole('searchbox').fill('растяжение')
	await page.getByRole('button', { name: 'Частые', exact: true }).click()
	await page.getByRole('button', { name: /^Движение/ }).click()
	await page.getByRole('option', { name: CROSSFIT.elements[0].title, exact: true }).click()
	await chooseSport(page, 'Кроссфит', 'Падел')

	await expect(page.locator('html')).toHaveAttribute('data-sport', 'padel')
	await expect(page.getByRole('searchbox')).toHaveValue('')
	await expect(page.getByRole('button', { name: 'Все', exact: true })).toHaveAttribute('aria-pressed', 'true')
	await expect(page.getByRole('button', { name: /^Удар или действие/ })).toHaveText(/любое/)
	await expect(page.locator('.index__announce')).toHaveText('Боль в паделе')
})

test('данные спорта не пришли -- обычный переход на его страницу', async ({ page }) => {
	await page.route('**/padel/scene.json', (route) => route.abort())
	await page.goto('/')
	await markPage(page)
	await chooseSport(page, 'Кроссфит', 'Падел')

	await expect(page).toHaveURL(/\/padel\/$/)
	await expect(page.locator('h1')).toHaveText('Боль в паделе')
	await expect.poll(() => page.evaluate(() => 'samePage' in window)).toBe(false)
})

// Пока данные спорта грузятся, кнопка показывает загрузку. Открыл за это время зону -- данные
// пришли не к месту: спорт не меняется, запись истории с зоной остаётся
test('зона, открытая во время загрузки спорта, отменяет смену', async ({ page }) => {
	let release!: () => void
	const held = new Promise<void>((resolve) => (release = resolve))

	await page.route('**/padel/scene.json', async (route) => {
		await held
		await route.continue()
	})

	await page.goto('/')
	await chooseSport(page, 'Кроссфит', 'Падел')
	await expect(page.locator('.index__title--home')).toHaveAttribute('aria-busy', 'true')
	await page.locator('.index__zone', { hasText: 'Колено' }).click()
	await expect(page).toHaveURL(/\/#zone=knee:\d$/)
	release()

	await expect(page.locator('.index__title--home')).toHaveAttribute('aria-busy', 'false')
	await expect(page).toHaveURL(/\/#zone=knee:\d$/)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')
})

// Подсветку модели видно только со сценой: под автотестом её включает `?scene`. Модель держим,
// пока спорт не сменят: сцена создаётся уже после смены и должна взять цвет нового спорта.
// Без анимаций цвет встаёт сразу: программный WebGL под нагрузкой рисует кадр раз в секунды,
// и перетекание не успевало бы
test('подсветка модели -- цвет спорта, даже если его сменили до загрузки модели', async ({ page }) => {
	// Модель грузится до минуты: 45 секунд на тест ей мало
	test.slow()
	await page.emulateMedia({ reducedMotion: 'reduce' })

	let release!: () => void
	const held = new Promise<void>((resolve) => (release = resolve))
	const glow = () =>
		page.evaluate(() => (window as unknown as { bodyScene: { glowHex(): string } }).bodyScene.glowHex())

	await page.route('**/model/body.glb*', async (route) => {
		await held
		await route.continue()
	})

	await page.goto('/?scene')
	await chooseSport(page, 'Кроссфит', 'Падел')
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'padel')
	release()
	await page.waitForFunction(() => 'bodyScene' in window, null, { timeout: 60_000 })
	expect(await glow()).toBe(PADEL.accent.glow)

	await chooseSport(page, 'Падел', 'Кроссфит')
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')
	expect(await glow()).toBe(CROSSFIT.accent.glow)
})

// Голень есть у травм падела и футбола, а у кроссфита нет: пустых зон в списке не бывает. Какие зоны
// у спорта, считает zones.test.ts, здесь -- что страница спорта берёт свои. Список зон рисуется
// и без модели, поэтому без `?scene`: сцена тут только тормозила
test('на странице спорта видны только зоны с его травмами', async ({ page }) => {
	await page.goto('/padel/')
	await expect(page.locator('.index__zone-label', { hasText: 'Голень' })).toBeVisible()
	await page.goto('/football/')
	await expect(page.locator('.index__zone-label', { hasText: 'Голень' })).toBeVisible()
	await page.goto('/crossfit/')
	await expect(page.locator('.index__zone-label', { hasText: 'Голень' })).toHaveCount(0)
})

// У кроссфита в шее мышечная боль и диссекция, а у бега ни у одной травмы шеи линзы нет
test('зона «Шея и верх спины» собирает травмы шеи спорта', async ({ page }) => {
	await page.goto('/#zone=neck:0')
	await expect(page.locator('.zone .zone__item')).toHaveText([/растяжение мышц шеи/, /Диссекция/])
	await page.goto('/running/')
	await expect(page.locator('.index__zone-label', { hasText: 'Шея и верх спины' })).toHaveCount(0)
})

test('«Разбор в …» ведёт на статью другого спорта к тому же разделу без нового шага', async ({ page }) => {
	await page.goto('/crossfit/ankle-sprain/')
	await page.locator('[data-sport-switch] astro-island:not([ssr])').waitFor({ state: 'attached' })

	const steps = await page.evaluate(() => history.length)

	await page.evaluate(() => document.querySelector('#treatment')?.scrollIntoView())
	// Фокус без прокрутки: читатель остаётся в разделе «Лечение»
	await sportButton(page, 'Кроссфит').evaluate((el: HTMLElement) => el.focus({ preventScroll: true }))
	await page.keyboard.press('Enter')
	await highlight(page, 'crossfit', 'padel')
	await page.keyboard.press('Enter')
	await expect(page).toHaveURL(/\/padel\/ankle-sprain\/#treatment$/)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'padel')
	expect(await page.evaluate(() => history.length)).toBe(steps)
})

// Из поисковика на статью и смена спорта: адрес заменяется, но стрелка «Назад» всё равно ведёт
// на главную, а не обратно в поисковик
test('из поисковика после смены спорта в статье «Назад» ведёт на главную', async ({ page }) => {
	await page.goto('about:blank')
	await page.goto('/football/orofacial-trauma/', { referer: 'https://www.google.com/' })
	await page.locator('[data-sport-switch] astro-island:not([ssr])').waitFor({ state: 'attached' })
	await sportButton(page, 'Футбол').click()
	await page.getByRole('option', { name: 'Кроссфит' }).click()
	await expect(page).toHaveURL(/\/crossfit\/orofacial-trauma\/$/)
	await page.getByRole('link', { name: 'Назад' }).click()
	await expect(page).toHaveURL(HOME)
	await expect(page.locator('.index__title--home')).toBeVisible()
})

// На странице элемента своей сцены спорта нет: «Разбор» в её статье -- обычный переход на статью
// спорта, а «Назад» возвращает к элементу его спорта
test('«Разбор в …» в статье на странице элемента ведёт на статью спорта', async ({ page }) => {
	await page.goto('/crossfit/elements/box-jump/')
	await page.locator('.zone__item, .index__item', { hasText: 'Растяжение связок голеностопа' }).first().click()

	const reader = page.locator('.reader:not(.theme-peek *)')

	await reader.locator('[data-sport-switch] button').click()
	await page.getByRole('option', { name: 'Падел' }).click()
	await expect(page).toHaveURL(/\/padel\/ankle-sprain\/$/)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'padel')

	await page.goBack()
	await expect(page).toHaveURL(/\/crossfit\/elements\/box-jump\/$/)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')
})

// Выбор спорта переживает уход на другую страницу: «Назад» к шагам главной, сделанным до смены
// спорта, открывает их в выбранном, даже если браузер грузит главную заново, а не из кеша
// Главная футбола -> статья футбола обычным переходом -> «Разбор» в кроссфите -> «Назад»: главная
// грузится заново (unload отключает bfcache), и скрипт в head сразу уводит на главную кроссфита
test('«Назад» на главную после смены спорта на другой странице открывает выбранный спорт', async ({ page }) => {
	await page.goto('/football/')
	await page.evaluate(() => addEventListener('unload', () => {}))
	await page.goto('/football/orofacial-trauma/')
	await page.locator('[data-sport-switch] astro-island:not([ssr])').waitFor({ state: 'attached' })
	await sportButton(page, 'Футбол').click()
	await page.getByRole('option', { name: 'Кроссфит' }).click()
	await expect(page).toHaveURL(/\/crossfit\/orofacial-trauma\/$/)

	await page.goBack()
	await expect(page).toHaveURL(HOME)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')
	await expect(page.locator('h1')).toHaveText('Боль в кроссфите')
})

test('после ухода на другую страницу «Назад» открывает прошлые шаги в выбранном спорте', async ({ page }) => {
	await page.goto('/football/')
	await page.locator('.index__zone', { hasText: 'Голова' }).click()
	await page.locator('.zone .zone__item', { hasText: 'Травмы лица' }).click()

	const reader = page.locator('.reader:not(.theme-peek *)')

	await reader.locator('[data-sport-switch] button').click()
	await page.getByRole('option', { name: 'Кроссфит' }).click()
	await expect(page).toHaveURL(/\/\/[^/]+\/#orofacial-trauma$/)
	// Обработчик unload отключает bfcache: главная при «Назад» грузится заново
	await page.evaluate(() => addEventListener('unload', () => {}))
	await page.goto('/about/')

	await page.goBack()
	await expect(page).toHaveURL(/\/\/[^/]+\/#orofacial-trauma$/)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')

	await page.goBack()
	await expect(page).toHaveURL(/\/\/[^/]+\/#zone=head:\d$/)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')
	await expect(page.locator('.zone__title')).toHaveText('Голова')
})

// Шаг главной падела с голенью, а у кроссфита её нет: скрипт в head уводит на главную кроссфита
// с этим хешем, та отбрасывает его и показывает общий план с постером
test('«Назад» на шаг с зоной, которой нет у выбранного спорта, открывает его общий план', async ({ page }) => {
	await page.goto('/padel/#zone=shin:0')
	await expect(page.locator('.zone__title')).toHaveText('Голень')
	await page.evaluate(() => addEventListener('unload', () => {}))
	await page.goto('/padel/ankle-sprain/')
	await page.locator('[data-sport-switch] astro-island:not([ssr])').waitFor({ state: 'attached' })
	await sportButton(page, 'Падел').click()
	await page.getByRole('option', { name: 'Кроссфит' }).click()
	await expect(page).toHaveURL(/\/crossfit\/ankle-sprain\/$/)

	await page.goBack()
	await expect(page).toHaveURL(HOME)
	await expect(page.locator('html')).toHaveAttribute('data-sport', 'crossfit')
	await expect(page.locator('.body3d__poster-image')).toBeVisible()
})

test('у травмы одного спорта вместо селекта -- текст', async ({ page }) => {
	await page.goto('/crossfit/distal-biceps-rupture/')
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
