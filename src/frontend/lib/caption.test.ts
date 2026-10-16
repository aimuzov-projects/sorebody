import assert from 'node:assert/strict'
import { test } from 'node:test'

import { splitCaption } from './caption.ts'

test('the caption is split into the figure title, the text and the AI note', () => {
	assert.deepEqual(
		splitCaption(
			'Плечо спереди: подлопаточная мышца на передней поверхности лопатки. Схематичная иллюстрация, сгенерирована нейросетью.',
		),
		{ title: 'Плечо спереди', text: 'подлопаточная мышца на передней поверхности лопатки.', generated: true },
	)
})

test('a caption without the note keeps all its text', () => {
	assert.deepEqual(splitCaption('Колено сбоку: мениски между костями.'), {
		title: 'Колено сбоку',
		text: 'мениски между костями.',
		generated: false,
	})
})

test('a caption without a short title before a colon stays text', () => {
	const caption = 'Связки, которые держат колено и не дают голени уехать вперёд при прыжке: передняя крестообразная.'

	assert.deepEqual(splitCaption(caption), { text: caption, generated: false })
})
