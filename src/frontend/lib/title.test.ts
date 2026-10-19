import assert from 'node:assert/strict'
import { test } from 'node:test'

import { site } from '#frontend/data/site.ts'

import { pageTitle, splitTitle } from './title.ts'

test('a page without its own name gets the site name with the descriptor', () => {
	assert.equal(pageTitle(), 'Sorebody — Справочник спортивной боли')
})

test('other pages get their own name and the site name after a dash', () => {
	assert.equal(pageTitle('Контакты'), `Контакты — ${site.name}`)
})

test('a trailing alias in brackets is split off the injury name', () => {
	assert.deepEqual(splitTitle('Разрыв передней крестообразной связки (ПКС)'), {
		name: 'Разрыв передней крестообразной связки',
		alias: 'ПКС',
	})

	assert.deepEqual(splitTitle('Синдром Педжета–Шреттера (тромбоз подключичной вены от нагрузки)'), {
		name: 'Синдром Педжета–Шреттера',
		alias: 'тромбоз подключичной вены от нагрузки',
	})
})

test('a name without a trailing alias stays whole', () => {
	assert.deepEqual(splitTitle('Разрыв мениска'), { name: 'Разрыв мениска' })
	// Скобки в середине -- часть названия
	assert.deepEqual(splitTitle('Тендинопатия (хроническая) локтя'), { name: 'Тендинопатия (хроническая) локтя' })
})

test('a bracketed list of parts is a clarification, not an alias', () => {
	const title = 'Растяжения мышц (дельтовидная, трапециевидная, квадрицепс, икры)'

	assert.deepEqual(splitTitle(title), { name: title })
})
