import assert from 'node:assert/strict'
import { test } from 'node:test'

import { movementIn } from './movement-match.ts'

test('finds the first movement in the text', () => {
	assert.equal(movementIn('жима, швунга и трастеров над головой'), 'overhead-press')
	assert.equal(movementIn('подтягиваний с киппингом и мышечных выходов'), 'kipping-pull-up')
	assert.equal(movementIn('глубокого приседа, wall balls и трастеров'), 'squat')
	assert.equal(movementIn('тяги рывковым хватом с пола до колен'), 'snatch')
	assert.equal(movementIn('ходьба без боли, ручной велоэргометр'), 'running')
})

test('prefers bench press over overhead press on the same word', () => {
	assert.equal(movementIn('жим гантели лёжа или со скамьи'), 'bench-press')
	assert.equal(movementIn('жима лёжа и жимов над головой'), 'bench-press')
	assert.equal(movementIn('жима стоя и швунга'), 'overhead-press')
})

test('does not take a stem from the middle of a word', () => {
	assert.equal(movementIn('отжимания от пола'), undefined)
	assert.equal(movementIn('избегать нагрузки'), undefined)
})

test('skips movements excluded with "без"', () => {
	assert.equal(movementIn('вариант без прыжка и с меньшим числом повторений'), undefined)
	assert.equal(movementIn('зашагивания на низкую тумбу, велотренажёр без рывков'), 'box-jump')
})

test('tells knees-to-chest apart from pull-ups', () => {
	assert.equal(movementIn('подтягивания колен к груди (toes to bar и подобного)'), 'toes-to-bar')
})

test('reads through non-breaking spaces left by the typograph', () => {
	assert.equal(movementIn('отжиманий в стойке на руках'), 'handstand-push-up')
	assert.equal(movementIn('прыжков на бокс'), 'box-jump')
})

test('returns undefined when nothing matches', () => {
	assert.equal(movementIn('возвращения к прежним весам и объёмам'), undefined)
})
