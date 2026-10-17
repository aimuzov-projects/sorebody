import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ATLAS_FILE, atlasSrc, atlasUrl } from './atlas.ts'

test('atlas files are named as in Wikimedia Commons', () => {
	assert.ok(ATLAS_FILE.test('Gray347.png'))
	assert.ok(ATLAS_FILE.test('Gray1234a.png'))
	assert.ok(!ATLAS_FILE.test('gray347.png'))
	assert.ok(!ATLAS_FILE.test('Gray347.jpg'))
	assert.ok(!ATLAS_FILE.test('../Gray347.png'))
})

test('the copy is served by the site, the link goes to the file page in Commons', () => {
	assert.equal(atlasSrc('Gray347.png'), '/injuries/atlas/Gray347.png')
	assert.equal(atlasUrl('Gray347.png'), 'https://commons.wikimedia.org/wiki/File:Gray347.png')
})
