import assert from 'node:assert/strict'
import { test } from 'node:test'

import { injuryPage } from './injury-page.ts'

test('a sport page links to its own article when the injury has one', () => {
	assert.equal(injuryPage('elbow-tendinopathy', ['crossfit', 'padel'], 'padel'), '/padel/elbow-tendinopathy/')
})

test('an injury of one sport leads to that article from anywhere', () => {
	assert.equal(injuryPage('achilles-tendon-rupture', ['crossfit'], 'padel'), '/crossfit/achilles-tendon-rupture/')
	assert.equal(injuryPage('achilles-tendon-rupture', ['crossfit']), '/crossfit/achilles-tendon-rupture/')
})

test('an injury of several sports leads to the shared page from elsewhere', () => {
	assert.equal(injuryPage('elbow-tendinopathy', ['crossfit', 'padel']), '/injuries/elbow-tendinopathy/')
})
