import {
	ArrowBigUp,
	ArrowBigUpDash,
	ArrowDownToLine,
	ArrowUpFromLine,
	BicepsFlexed,
	Box,
	ChevronsUp,
	Dumbbell,
	Flame,
	Footprints,
	Hand,
	HandGrab,
	MoveVertical,
	Repeat2,
	Infinity as Rings,
	Spline,
	Volleyball,
	Waves,
	Weight,
	Zap,
} from 'lucide-static'

import type { CrossfitElement } from './sports.ts'

/**
 * Иконки Lucide у движений кроссфита. Пиктограмм кроссфита в наборе нет, поэтому знак -- по сути
 * движения: куда идёт штанга, за что держатся, чем работают. Гиря -- `weight`,
 * кольца -- `infinity`.
 */
export const MOVEMENT_ICONS: Record<CrossfitElement, string> = {
	squat: ArrowDownToLine,
	deadlift: ArrowUpFromLine,
	'hip-thrust': ArrowBigUp,
	snatch: Zap,
	'clean-and-jerk': ChevronsUp,
	'overhead-press': ArrowBigUpDash,
	thruster: MoveVertical,
	'bench-press': Dumbbell,
	'kipping-pull-up': Spline,
	'muscle-up': BicepsFlexed,
	'ring-dip': Rings,
	'handstand-push-up': Hand,
	'toes-to-bar': HandGrab,
	'box-jump': Box,
	'double-unders': Repeat2,
	running: Footprints,
	rowing: Waves,
	'wall-ball': Volleyball,
	'kettlebell-swing': Weight,
	burpee: Flame,
}
