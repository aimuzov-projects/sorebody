import type { APIRoute } from 'astro'

import { SPORTS, type Sport } from '#frontend/data/sports.ts'
import { sceneData } from '#frontend/scene/scene-data.ts'

/**
 * Данные сцены спорта для смены спорта без перезагрузки (components/body-3d.svelte): главная
 * берёт их, когда в заголовке выбирают другой спорт. Те же, что страница спорта отдаёт острову.
 */
export function getStaticPaths() {
	return SPORTS.map((sport) => ({ params: { sport: sport.slug }, props: { sport } }))
}

export const GET: APIRoute<{ sport: Sport }> = async ({ props }) => {
	const { zones, whole, movements, scene } = await sceneData(props.sport)

	return Response.json({ zones, whole, movements, sport: scene })
}
