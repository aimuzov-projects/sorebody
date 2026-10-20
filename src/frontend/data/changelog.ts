import { visibleReleases, type Release } from '@aimuzov-projects/infra-site-kit/changelog.js'
import * as lucide from 'lucide-static'

import { PADEL_RACKET } from '#frontend/lib/icons.ts'

import releases from './changelog.json' with { type: 'json' }

/**
 * Что нового на сайте, для читателя: страница /changelog. Записи лежат в changelog.json и пишутся
 * в релизный PR через site-changelog из infra-site-kit, правила тона -- в changelog.guide.md.
 * Здесь записи только получают SVG своих иконок.
 */
const ICONS: Record<string, string> = { ...lucide, PadelRacket: PADEL_RACKET }

export const RELEASES = visibleReleases(releases as Release[]).map((r) => ({
	...r,
	icon: (r.icon && ICONS[r.icon]) || '',
}))
