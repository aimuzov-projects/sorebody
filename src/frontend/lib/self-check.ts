import { URGENCY } from '#frontend/data/urgency.ts'

/**
 * Самопроверка "Мне к врачу?" (разметка -- lib/article-blocks.ts): по отмеченным признакам
 * показывает ответ для самого срочного, без отметок -- спокойный ответ. Блок без JS скрыт,
 * здесь он появляется. На телефоне, пока карточка ответа за краем экрана, внизу видна полоска
 * с тем же выводом; на десктопе полоску прячет CSS. Возвращает функцию снятия.
 */
export function initSelfCheck(root: Element) {
	const checks = [...root.querySelectorAll<HTMLFieldSetElement>('[data-self-check]')]

	const update = (check: HTMLFieldSetElement) => {
		const marked = new Set(
			[...check.querySelectorAll<HTMLInputElement>('input:checked')].map((box) => box.dataset.urgency),
		)
		// URGENCY идёт от самого срочного: первый отмеченный уровень и есть ответ
		const level = URGENCY.find((urgency) => marked.has(urgency)) ?? 'none'

		for (const verdict of check.querySelectorAll<HTMLElement>('[data-verdict]'))
			verdict.hidden = verdict.dataset.verdict !== level
	}

	const onChange = (event: Event) => update(event.currentTarget as HTMLFieldSetElement)
	// Чем отмечают: пальцем и мышью -- без кольца фокуса, клавиатурой -- с ним (styles/article.css)
	const onPointer = (event: Event) => ((event.currentTarget as HTMLElement).dataset.pointer = '')
	const onKey = (event: Event) => delete (event.currentTarget as HTMLElement).dataset.pointer

	// Полоска видна, только пока карточка ответа целиком за экраном
	const observer = new IntersectionObserver((entries) => {
		for (const entry of entries) {
			const bar = entry.target.closest('[data-self-check]')?.querySelector<HTMLElement>('[data-self-check-bar]')

			if (bar) bar.hidden = entry.isIntersecting
		}
	})

	for (const check of checks) {
		check.hidden = false
		check.addEventListener('change', onChange)
		check.addEventListener('pointerdown', onPointer)
		check.addEventListener('keydown', onKey)
		update(check)

		const result = check.querySelector('#self-check-result')

		if (result) observer.observe(result)
	}

	return () => {
		observer.disconnect()

		for (const check of checks) {
			check.removeEventListener('change', onChange)
			check.removeEventListener('pointerdown', onPointer)
			check.removeEventListener('keydown', onKey)
		}
	}
}
