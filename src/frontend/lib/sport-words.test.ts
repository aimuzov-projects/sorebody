import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sportWordsIn } from './sport-words.ts'

const NBSP = ' '

test('catches CrossFit, the gym and its equipment in any case and form', () => {
	for (const text of [
		'после кроссфита',
		'CrossFit Open',
		'доделать wod',
		'атлеты HIFT',
		`функциональный${NBSP}фитнес`,
		'конец комплекса',
		'штанга на груди',
		'гриф упал',
		'вис на турнике',
		'перекладина',
		'вернуться на кольца',
		'отжимания на кольцах',
		'работа с кольцами',
		'в кольцах',
		'прыжок на тумбу',
		`прыгать на${NBSP}бокс`,
		'рывок',
		'в рывке со штангой',
		'рывки гири',
		'три бёрпи',
		'бурпи',
		'трастеры',
		'в зале',
		'спортзал',
		'залы',
		'последний раунд',
		'рекорд на табло',
	])
		assert.notDeepEqual(sportWordsIn(text), [], text)
})

test('catches football gear and the tackle, but not the same letters elsewhere', () => {
	for (const text of ['подкат сзади', 'после подката', 'бутсы', 'в бутсах', 'щитки', 'без щитков'])
		assert.notDeepEqual(sportWordsIn(text), [], text)

	for (const text of ['к горлу подкатывает тошнота', 'подкатила слабость', 'щитовидный хрящ'])
		assert.deepEqual(sportWordsIn(text), [], text)
})

test('lets medical and everyday words through', () => {
	for (const text of [
		'толчок стопой',
		'комплексное лечение',
		'комплекс упражнений ЛФК',
		`треугольного фиброзно-хрящевого${NBSP}комплекса`,
		'треугольного фиброзно-хрящевого\nкомплекса',
		'разрыв фиброзного кольца',
		'протрузии и трещины кольца',
		'снять с руки кольца, часы',
		`фиброзного${NBSP}кольца`,
		'почти кольцевой мениск',
		'резкий рывок руки',
		`резкого${NBSP}рывка`,
		'дёрнуть рывком',
		'врач сказал',
		'показала МРТ',
		'бокс как вид спорта',
		'подтягивания и тяги',
	])
		assert.deepEqual(sportWordsIn(text), [], text)
})
