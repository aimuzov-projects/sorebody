/**
 * Слово в нужной форме после числа: 1 боль, 3 боли, 11 болей. Формы -- для одного, для
 * двух-четырёх и для пяти, по умолчанию "боль".
 */
export function plural(n: number, [one, few, many]: [string, string, string] = ['боль', 'боли', 'болей']) {
	const mod10 = n % 10
	const mod100 = n % 100

	if (mod10 === 1 && mod100 !== 11) return one

	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few

	return many
}
