import { expect, test, type Locator, type Page } from '@playwright/test'

const SLUG = 'acl-tear'

test.use({ viewport: { width: 375, height: 663 }, hasTouch: true, isMobile: true })

/** Палец ведут по элементу вправо: от `fromX` до `toX` в долях его ширины, за `ms`. */
async function swipe(page: Page, on: Locator, { fromX = 0.2, toX = 0.8, dy = 0, ms = 200 } = {}) {
	const box = (await on.boundingBox())!
	const y = box.y + Math.min(box.height / 2, 200)

	await on.evaluate(
		(el, { x0, x1, y, dy, ms }) => {
			const touch = (x: number, y: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
			const fire = (type: string, x: number, y: number, timeStamp: number) => {
				const t = touch(x, y)
				const event = new TouchEvent(type, {
					bubbles: true,
					cancelable: true,
					touches: type === 'touchend' ? [] : [t],
					changedTouches: [t],
				})

				// timeStamp у синтетического события -- время создания, его и подменяем
				Object.defineProperty(event, 'timeStamp', { value: timeStamp })
				el.dispatchEvent(event)
			}
			const now = performance.now()

			fire('touchstart', x0, y, now)
			fire('touchmove', (x0 + x1) / 2, y + dy / 2, now + ms / 2)
			fire('touchend', x1, y + dy, now + ms)
		},
		{ x0: box.x + box.width * fromX, x1: box.x + box.width * toX, y, dy, ms },
	)
}

test('свайп вправо в ридере закрывает статью, как «Назад»', async ({ page }) => {
	await page.goto(`/#${SLUG}`)

	const reader = page.locator('.reader:not(.theme-peek *)')

	await expect(reader.locator('.article__title')).toBeVisible()
	await swipe(page, reader.locator('.article__title'))
	await expect(reader).toHaveCount(0)
})

test('свайп вправо в зоне возвращает к списку зон', async ({ page }) => {
	await page.goto('/')
	await page.locator('.index__zone', { hasText: 'Плечо' }).tap()
	await expect(page.locator('.zone')).toBeVisible()

	await swipe(page, page.locator('.zone'))
	await expect(page).not.toHaveURL(/#zone=/)
})

test('свайп вправо на странице статьи уводит туда, откуда пришли', async ({ page }) => {
	await page.goto('/about/')
	await page.goto(`/crossfit/${SLUG}/`, { referer: page.url() })

	await swipe(page, page.locator('.article__title'))
	await expect(page).toHaveURL(/\/about\/$/)
})

test('медленное, вертикальное и короткое движения -- не свайп', async ({ page }) => {
	await page.goto(`/#${SLUG}`)

	const reader = page.locator('.reader:not(.theme-peek *)')
	const title = reader.locator('.article__title')

	await expect(title).toBeVisible()
	await swipe(page, title, { ms: 1500 })
	await swipe(page, title, { dy: 300 })
	await swipe(page, title, { toX: 0.35 })
	await page.waitForTimeout(300)
	await expect(reader).toHaveCount(1)
})
