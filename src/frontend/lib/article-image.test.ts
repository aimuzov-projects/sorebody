import assert from 'node:assert/strict'
import { test } from 'node:test'

import { imageSrcset, imageVariant } from './article-image.ts'

test('a variant sits next to the original with its width in the name', () => {
	assert.equal(imageVariant('/injuries/knee-01-anatomy.webp', 600), '/injuries/knee-01-anatomy-600w.webp')
	assert.equal(imageVariant('/injuries/acl-tear-02.jpg', 900), '/injuries/acl-tear-02-900w.jpg')
})

test('srcset lists the variants and the original, narrowest first', () => {
	assert.equal(
		imageSrcset('/injuries/knee-01.webp'),
		'/injuries/knee-01-600w.webp 600w, /injuries/knee-01-900w.webp 900w, /injuries/knee-01.webp 1200w',
	)
})
