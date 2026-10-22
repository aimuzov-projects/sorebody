import type { ChatCard, ChatFailure, ChatFlags } from '#frontend/lib/chat-client.ts'

/** Вопрос и ответ на него, как их собирает строка чата из событий потока. */
export type ChatTurn = {
	question: string
	step?: 'red-flags' | 'search' | 'article'
	flags: ChatFlags
	cards: ChatCard[]
	text?: string
	failure?: ChatFailure
	pending: boolean
}

/** Сколько вопросов в диалоге: столько же пускает сервер (src/backend/chat/turn.ts, LIMITS). */
export const CHAT_TURNS = 4

export const CHAT_STEPS = {
	'red-flags': 'Проверяю тревожные признаки…',
	search: 'Ищу похожие травмы…',
	article: 'Читаю статью…',
}

export const CHAT_URGENCY = {
	call: 'Скорая 103 или 112',
	today: 'Сегодня в травмпункт',
	soon: 'К врачу в ближайшие дни',
}

const OVER = 'В этом диалоге вопросов больше нельзя. Начните новый.'

export const CHAT_FAILURES: Record<ChatFailure, string> = {
	rate: 'Слишком много вопросов подряд. Подождите минуту и спросите снова.',
	closed: 'Ассистент на сегодня всё, вернётся завтра.',
	turns: OVER,
	cost: OVER,
	expired: 'Диалог закончился: прошло больше получаса. Начните новый.',
	busy: 'Предыдущий ответ ещё готовится.',
	unavailable: 'Не получилось ответить. Попробуйте чуть позже.',
}
