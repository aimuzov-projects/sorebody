import { mount, unmount } from 'svelte'

import { metrikaGoal } from '#frontend/lib/metrika.ts'
import { probeWebGL } from '#frontend/scene/gpu.ts'

/**
 * 3D-модель у иллюстрации статьи: кнопка «3D-модель» в углу фото (article-figure.astro)
 * открывает модель на весь экран (components/figure-3d.svelte). Пока её не нажали, three.js
 * и модель не грузятся. Одно и то же для отдельной страницы и статьи поверх главной, где
 * острова Astro не оживают: вызывает initReading(). Возвращает функцию, которая снимает
 * открытую модель и отдаёт её WebGL-контекст.
 *
 * Открытая модель -- шаг в истории с тем же адресом: на телефоне её закрывают жестом «Назад»,
 * и он не должен уводить со статьи. Главная на этот шаг не реагирует: хеш тот же.
 */
/**
 * Модель у иллюстрации: адрес GLB, структуры травмы для подсветки, группы, видимые и спрятанные
 * сразу, откуда смотреть (как на иллюстрации) и пометка статьи для (i).
 */
export type FigureModel = {
	url: string
	highlight: string[]
	show: string[]
	hide: string[]
	direction?: [number, number, number]
	note?: string
}

export function initFigure3d(root: Element) {
	const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-figure-3d]')]

	if (!buttons.length || probeWebGL() === 'none') return () => {}

	let close: (() => void) | null = null
	const onHistory = () => close?.()
	// Крестик и Esc закрывают через историю: шаг модели уходит, и «Вперёд» её не вернёт
	const requestClose = () => (history.state?.figure3d ? history.back() : close?.())

	async function open(button: HTMLButtonElement) {
		if (close) return

		// Пока грузится компонент, второе нажатие не откроет вторую модель
		close = () => {}
		metrikaGoal('figure-3d')

		const { default: Figure3d } = await import('#frontend/components/figure-3d.svelte')
		const component = mount(Figure3d, {
			target: button.parentElement!,
			props: { model: JSON.parse(button.getAttribute('data-figure-3d')!) as FigureModel, onclose: requestClose },
		})

		history.pushState({ ...history.state, figure3d: true }, '')
		addEventListener('popstate', onHistory)

		close = () => {
			removeEventListener('popstate', onHistory)
			close = null
			void unmount(component)
			button.focus()
		}
	}

	const listeners = buttons.map((button) => {
		const onClick = () => void open(button)

		button.hidden = false
		button.addEventListener('click', onClick)

		return () => button.removeEventListener('click', onClick)
	})

	return () => {
		close?.()

		for (const stop of listeners) stop()
	}
}
