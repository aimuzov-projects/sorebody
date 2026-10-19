/** Слово "травма" в нужной форме после числа: 1 травма, 3 травмы, 11 травм. */
export function plural(n: number) {
	const mod10 = n % 10
	const mod100 = n % 100

	if (mod10 === 1 && mod100 !== 11) return 'травма'

	if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'травмы'

	return 'травм'
}
