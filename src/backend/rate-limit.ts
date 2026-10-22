/**
 * Сколько запросов в окно пускать с одного адреса. Окно фиксированное: просто,
 * и для защиты от перебора хватает. Счётчики живут в памяти процесса, после
 * перезапуска считаем заново.
 */
export function rateLimit({
	limit,
	windowMs,
	now = Date.now,
}: {
	limit: number
	windowMs: number
	now?: () => number
}) {
	const windows = new Map<string, { count: number; reset: number }>()

	return (key: string) => {
		const time = now()
		let window = windows.get(key)

		if (!window || window.reset <= time) {
			// Старые окна чистим заодно, иначе карта растёт с каждым новым адресом.
			for (const [k, w] of windows) if (w.reset <= time) windows.delete(k)

			window = { count: 0, reset: time + windowMs }
			windows.set(key, window)
		}

		window.count++

		return { allowed: window.count <= limit, retryAfter: Math.ceil((window.reset - time) / 1000) }
	}
}
