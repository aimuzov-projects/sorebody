import type { CrossfitElement as Movement } from '#frontend/data/sports.ts'

/**
 * Корни, по которым движение узнаётся в свободном тексте пары "Вместо/Лучше". `\b` в JS
 * кириллицу не видит, поэтому начало слова -- через `(?<!\p{L})`. Ходьба идёт под бег: иконка
 * у них общая. Порядок важен при равной позиции: "жим лёжа" раньше просто "жима".
 */
const RULES: [RegExp, Movement][] = [
	[/(?<!\p{L})жим\p{L}*(?:\s+[^\s,;.]+){0,5}?\s+(?:лежа|скам|от груди)/u, 'bench-press'],
	[/(?<!\p{L})(?:стой\p{L}* на руках|стоек на руках|отжиман\p{L}* в стойке)/u, 'handstand-push-up'],
	[/(?<!\p{L})(?:жим|швунг)/u, 'overhead-press'],
	[/(?<!\p{L})трастер/u, 'thruster'],
	[/(?<!\p{L})рыв(?:к|ок)/u, 'snatch'],
	[/(?<!\p{L})(?:толч|взяти\p{L}* на грудь|взятий на грудь|олимпийск)/u, 'clean-and-jerk'],
	[/(?<!\p{L})(?:станов|румынск|тяг\p{L}* на прямых ногах|тяг\p{L}* с блоков|тяжестей с пола)/u, 'deadlift'],
	[/(?<!\p{L})(?:присед|гоблет|пистолет)/u, 'squat'],
	[/(?<!\p{L})(?:ягодичн\p{L}* мост|мост)/u, 'hip-thrust'],
	[/(?<!\p{L})(?:ног\p{L}* к перекладине|toes.to.bar|колен к груди)/u, 'toes-to-bar'],
	[/(?<!\p{L})(?:подтягиван(?:ия|ий|ие)(?! колен)|кипинг|киппинг)/u, 'kipping-pull-up'],
	[/(?<!\p{L})(?:выход\p{L}* силой|мышечн\p{L}* выход|мышап)/u, 'muscle-up'],
	[/(?<!\p{L})(?:брусь|кольц)/u, 'ring-dip'],
	[/(?<!\p{L})(?:скакалк|двойн\p{L}* прыжк)/u, 'double-unders'],
	[/(?<!\p{L})(?:тумб|прыжк\p{L}* на бокс|шаг\p{L}* на бокс|степ-ап|зашагиван)/u, 'box-jump'],
	[/(?<!\p{L})(?:бег(?:а|ом|у|е)?(?!\p{L})|спринт|ходьб)/u, 'running'],
	[/(?<!\p{L})греб[лн]/u, 'rowing'],
	[/(?:wall.?ball|(?<!\p{L})брос\p{L}* мяча)/u, 'wall-ball'],
	[/(?<!\p{L})мах\p{L}* гир/u, 'kettlebell-swing'],
	[/(?<!\p{L})берпи/u, 'burpee'],
]

/**
 * Первое по тексту движение из списка или `undefined`. Оговорки "без прыжка", "без рывков"
 * выкидываются заранее: движение в них как раз отсутствует.
 */
export function movementIn(text: string): Movement | undefined {
	const plain = text
		.toLowerCase()
		.replaceAll('ё', 'е')
		.replace(/\s+/gu, ' ')
		.replace(/(?<!\p{L})без\s+[\p{L}-]+/gu, '')
	let best: { at: number; movement: Movement } | undefined

	for (const [rule, movement] of RULES) {
		const at = plain.search(rule)

		if (at >= 0 && (!best || at < best.at)) best = { at, movement }
	}

	return best?.movement
}
