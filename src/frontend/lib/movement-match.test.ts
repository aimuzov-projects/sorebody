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

test('padel: a sprint is a dash to the ball, not a barbell lift', () => {
	assert.equal(movementIn('рывков за каждым мячом', 'padel'), 'sprint-to-ball')
	assert.equal(movementIn('смэша в прыжке', 'padel'), 'smash')
	assert.equal(movementIn('мощного удара слева с доработкой кистью', 'padel'), 'backhand')
	assert.equal(movementIn('глубоких выпадов к низкому мячу', 'padel'), 'lunge')
})

test('football: shuttle runs are a change of direction, plain running stays running', () => {
	assert.equal(movementIn('рывков, финтов и челночного бега', 'football'), 'sprint')
	assert.equal(movementIn('челночного бега', 'football'), 'change-of-direction')
	assert.equal(movementIn('бег по прямой в ровном темпе', 'football'), 'running')
	assert.equal(movementIn('борьбы за верховые мячи в прыжке', 'football'), 'tackle')
	assert.equal(movementIn('вратарской тренировки с прыжками', 'football'), 'goalkeeping')
})

test('running: the icon is the load that changes, plain running gets none', () => {
	assert.equal(movementIn('длинных спусков под гору', 'running'), 'downhill')
	assert.equal(movementIn('интервалов на стадионе', 'running'), 'speed-work')
	assert.equal(movementIn('резкого роста недельного объёма', 'running'), 'mileage-spike')
	assert.equal(movementIn('марафона в жару', 'running'), 'race')
	assert.equal(movementIn('бега в жару днём', 'running'), 'heat')
	assert.equal(movementIn('бега по корням и камням на трейле', 'running'), 'trail')
	assert.equal(movementIn('сразу перейти в минималистичную обувь', 'running'), 'footwear-change')
	assert.equal(movementIn('лёгкого бега в ровном темпе', 'running'), undefined)
})

test('running: run-walk, drinking volumes and calf raises get no load icon', () => {
	assert.equal(movementIn('отрезки бега с ходьбой', 'running'), undefined)
	assert.equal(movementIn('по жажде: заданные объёмы не подходят', 'running'), undefined)
	assert.equal(movementIn('подъёмы на носки с весом', 'running'), undefined)
	assert.equal(movementIn('жаропонижающих перед сном', 'running'), undefined)
	assert.equal(movementIn('влажной салфетки', 'running'), undefined)
	assert.equal(movementIn('шаг чуть короче и чаще', 'running'), 'overstriding')
	assert.equal(movementIn('чуть более частый шаг', 'running'), 'overstriding')
	assert.equal(movementIn('длинной медленной пробежки', 'running'), 'mileage-spike')
	assert.equal(movementIn('старта после болезни', 'running'), 'race')
})
