/**
 * Раздел статьи, который сейчас читают: при смене спорта в «Разбор ‹в кроссфите ▾›»
 * (components/sport-switch.svelte) статья другого спорта открывается на нём же. Разделы у статей
 * спорта одни и те же (lib/article-html.ts), поэтому якорь там найдётся. Это последний раздел,
 * чей заголовок уже поднялся в верхнюю треть экрана; в начале статьи -- никакого.
 */
export function currentSection(root: ParentNode, top = innerHeight / 3) {
	let id: string | undefined

	for (const section of root.querySelectorAll<HTMLElement>('.article-section[id]'))
		if (section.getBoundingClientRect().top <= top) id = section.id

	return id
}
