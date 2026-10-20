import type { SportSlug } from './sports.ts'

/** Обёртка как у lucide-static: сетка 24, линия 2, круглые концы. */
const icon = (name: string, body: string) =>
	`<svg class="lucide lucide-${name}" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`

/**
 * Иконки спортов в стиле Lucide. В наборе нет ни мяча, ни ракетки, а гиря, гантель и ворота уже
 * заняты движениями (`movement-icons.ts`), поэтому знаки свои: гиря, ракетка падела с мячом,
 * футбольный мяч.
 */
export const SPORT_ICONS: Record<SportSlug, string> = {
	crossfit: icon(
		'kettlebell',
		'<path d="M7.5 10.5 7 6a2 2 0 0 1 2-2.2h6A2 2 0 0 1 17 6l-.5 4.5"/><path d="M6 21a7.5 7.5 0 1 1 12 0Z"/>',
	),
	padel: icon(
		'padel',
		'<ellipse cx="11" cy="9" rx="6" ry="7"/><rect x="9.5" y="16" width="3" height="6" rx="1"/><circle cx="19.5" cy="19" r="2"/><path d="M9.5 6.5h.01M12.5 6.5h.01M8 9.5h.01M11 9.5h.01M14 9.5h.01M9.5 12.5h.01M12.5 12.5h.01"/>',
	),
	football: icon(
		'football',
		'<circle cx="12" cy="12" r="10"/><path d="M12 8 15.8 10.8 14.4 15.2H9.6L8.2 10.8Z" fill="currentColor"/><path d="M12 8V5M7.9 2.9 12 5l4.1-2.1M15.8 10.8l2.9-1M19.4 5.3l-.7 4.5 3.2 3.2M14.4 15.2l1.7 2.5M20.7 17l-4.6.7-2 4.1M9.6 15.2l-1.7 2.5M9.9 21.8l-2-4.1-4.6-.7M8.2 10.8l-2.9-1M2.1 13l3.2-3.2-.7-4.5"/>',
	),
}
