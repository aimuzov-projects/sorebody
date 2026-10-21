/** Сколько идёт счёт, мс. */
const DURATION = 1400

/**
 * Число из подписи крупной цифры: "−51%" -- знак "−", 51 и "%", "38,2%" -- 38,2 с одним знаком
 * после запятой. Без числа -- `undefined`, такую цифру не анимируем.
 */
export function parseStat(value: string) {
	const match = value.match(/^(\D*?)(\d+)(?:,(\d+))?(\D*)$/)

	if (!match) return undefined

	const [, prefix = '', whole = '', fraction = '', suffix = ''] = match

	return { prefix, suffix, target: Number(`${whole}.${fraction || 0}`), decimals: fraction.length }
}

/** Как число выглядит на кадре: с запятой и тем же числом знаков, что в подписи. */
export const formatStat = ({ prefix, suffix, decimals }: NonNullable<ReturnType<typeof parseStat>>, n: number) =>
	`${prefix}${n.toFixed(decimals).replace('.', ',')}${suffix}`

/**
 * Крупная цифра (`.big-stat__value`) набегает от нуля, когда въезжает в окно: так её замечают.
 * Один раз, при reduced motion -- сразу итог. В разметке стоит итоговое число: без JS и для
 * поиска всё как есть.
 * Возвращает функцию снятия.
 */
export function initCountUp(root: Element) {
	if (matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {}

	const frames = new Set<number>()
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue

				observer.unobserve(entry.target)
				run(entry.target as HTMLElement)
			}
		},
		{ threshold: 0.6 },
	)

	// Кольцо доли (lib/article-blocks.ts) заполняется вместе с числом
	const ringOf = (el: HTMLElement) => el.closest('.big-stat')?.querySelector('.big-stat__fill')

	const run = (el: HTMLElement) => {
		const stat = parseStat(el.dataset.countTo!)!
		const start = performance.now()

		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / DURATION)
			// Быстрый старт и мягкая посадка, как у переходов статьи (lib/fade-up.ts)
			const eased = 1 - (1 - t) ** 4

			el.textContent = formatStat(stat, stat.target * eased)
			ringOf(el)?.setAttribute('stroke-dasharray', `${stat.target * eased} 100`)

			if (t < 1) frames.add(requestAnimationFrame(tick))
		}

		frames.add(requestAnimationFrame(tick))
	}

	for (const el of root.querySelectorAll<HTMLElement>('.big-stat__value')) {
		const value = el.textContent?.trim() ?? ''
		const stat = parseStat(value)

		if (!stat) continue

		el.dataset.countTo = value
		el.textContent = formatStat(stat, 0)
		ringOf(el)?.setAttribute('stroke-dasharray', '0 100')
		observer.observe(el)
	}

	return () => {
		observer.disconnect()
		frames.forEach(cancelAnimationFrame)
	}
}
