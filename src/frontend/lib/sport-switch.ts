/**
 * Селект «Разбор ‹в кроссфите ▾›» под названием травмы: смена спорта ведёт на статью этой травмы
 * в другом спорте, к разделу, который сейчас читают. Разделы у статей спорта одни и те же
 * (lib/article-html.ts), поэтому якорь там найдётся. Работает и на странице статьи, и в статье
 * поверх модели.
 */
export function initSportSwitch(root: ParentNode) {
	const select = root.querySelector<HTMLSelectElement>('[data-sport-select]')

	if (!select) return

	// Селект держим на своём спорте: после «Назад» из bfcache иначе стоял бы чужой, и повторный
	// выбор того же пункта не срабатывал бы
	const own = () => [...select.options].find((o) => o.defaultSelected)?.value ?? select.value

	select.addEventListener('change', () => {
		const section = currentSection(root)
		const href = select.value

		select.value = own()
		location.assign(section ? `${href}#${section}` : href)
	})
	addEventListener('pageshow', (event) => {
		if (event.persisted) select.value = own()
	})
}

/** Последний раздел, чей заголовок уже поднялся в верхнюю треть экрана; в начале статьи -- никакого. */
export function currentSection(root: ParentNode, top = innerHeight / 3) {
	let id: string | undefined

	for (const section of root.querySelectorAll<HTMLElement>('.article-section[id]'))
		if (section.getBoundingClientRect().top <= top) id = section.id

	return id
}
