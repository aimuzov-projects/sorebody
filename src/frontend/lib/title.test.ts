import assert from 'node:assert/strict'
import { test } from 'node:test'

import { site } from '#frontend/data/site.ts'

import { pageTitle } from './title.ts'

test('the home page gets only the site name', () => {
	assert.equal(pageTitle(), site.name)
})

test('other pages get their own name and the site name after a dash', () => {
	assert.equal(pageTitle('Контакты'), `Контакты — ${site.name}`)
})
