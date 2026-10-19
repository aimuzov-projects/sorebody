import assert from 'node:assert/strict'
import { test } from 'node:test'

import { telegramThemeVars } from './telegram-theme.ts'

const theme = { bg_color: '#17212b', text_color: '#f5f5f5', hint_color: '#708499', secondary_bg_color: '#232e3c' }

test('without a sport the accent is the Telegram text colour and marks on it use the Telegram background', () => {
	const vars = telegramThemeVars(theme, false)

	assert.equal(vars['--accent'], theme.text_color)
	assert.equal(vars['--on-accent'], theme.bg_color)
})

test('on a sport page the accent and marks on it stay the sport colours', () => {
	const vars = telegramThemeVars(theme, true)

	assert.equal(vars['--accent'], undefined)
	assert.equal(vars['--on-accent'], undefined)
	assert.equal(vars['--fg'], theme.text_color)
})
