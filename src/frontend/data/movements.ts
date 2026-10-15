/**
 * Движения, на которых травмы случаются чаще всего. Статья ссылается на них по slug,
 * страница `/movements/<slug>` собирает травмы движения из frontmatter.
 */
export const MOVEMENTS = [
	{ slug: 'squat', title: 'Приседания со штангой', titleEn: 'Back/front squat' },
	{ slug: 'deadlift', title: 'Становая тяга', titleEn: 'Deadlift' },
	{ slug: 'snatch', title: 'Рывок', titleEn: 'Snatch' },
	{ slug: 'clean-and-jerk', title: 'Взятие на грудь и толчок', titleEn: 'Clean and jerk' },
	{ slug: 'overhead-press', title: 'Жимы и швунги над головой', titleEn: 'Press, push press, push jerk' },
	{ slug: 'thruster', title: 'Трастеры', titleEn: 'Thruster' },
	{ slug: 'kipping-pull-up', title: 'Подтягивания с кипом', titleEn: 'Kipping pull-up' },
	{ slug: 'muscle-up', title: 'Выход силой', titleEn: 'Muscle-up' },
	{ slug: 'ring-dip', title: 'Отжимания на кольцах', titleEn: 'Ring dip' },
	{ slug: 'handstand-push-up', title: 'Отжимания в стойке на руках', titleEn: 'Handstand push-up' },
	{ slug: 'toes-to-bar', title: 'Ноги к перекладине', titleEn: 'Toes-to-bar' },
	{ slug: 'box-jump', title: 'Прыжки на тумбу', titleEn: 'Box jump' },
	{ slug: 'double-unders', title: 'Двойные прыжки через скакалку', titleEn: 'Double-unders' },
	{ slug: 'running', title: 'Бег', titleEn: 'Running' },
	{ slug: 'rowing', title: 'Гребля', titleEn: 'Rowing' },
	{ slug: 'wall-ball', title: 'Броски мяча в цель', titleEn: 'Wall ball' },
	{ slug: 'kettlebell-swing', title: 'Махи гирей', titleEn: 'Kettlebell swing' },
	{ slug: 'burpee', title: 'Бёрпи', titleEn: 'Burpee' },
] as const

export type Movement = (typeof MOVEMENTS)[number]['slug']

export const MOVEMENT_SLUGS = MOVEMENTS.map((m) => m.slug) as [Movement, ...Movement[]]
