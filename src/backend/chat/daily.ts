const DAY = 86_400_000

/** Москва -- UTC+3 круглый год, переходов на летнее время нет. */
const MOSCOW = 3 * 60 * 60_000

/**
 * Деньги или диалоги за календарные сутки по Москве. В полночь счётчик
 * обнуляется сам: "вернётся завтра" значит "после полуночи". Живёт в памяти,
 * перезапуск его обнуляет -- от этого страхует лимит кредитов на ключе.
 */
export function dailyCounter({ limit, now = Date.now }: { limit: number; now?: () => number }) {
	const dayOf = (time: number) => Math.floor((time + MOSCOW) / DAY)

	let day = dayOf(now())
	let used = 0

	const roll = () => {
		const today = dayOf(now())

		if (today !== day) {
			day = today
			used = 0
		}
	}

	return {
		add(amount: number) {
			roll()
			used += amount
		},

		/** Есть ли ещё запас на сегодня. */
		get open() {
			roll()

			return used < limit
		},

		get used() {
			roll()

			return used
		},

		/** Когда счётчик обнулится: ближайшая полночь по Москве. */
		get resetsAt() {
			return new Date((dayOf(now()) + 1) * DAY - MOSCOW).toISOString()
		},
	}
}
