import { CHAT_TURNS, type ChatTurn } from '#frontend/lib/chat-texts.ts'

/**
 * Диалог один на всю вкладку: ридер главной пересоздаёт строку чата при смене статьи, а
 * переписка должна пережить переход. Живёт только в памяти страницы, никуда не сохраняется.
 */
export const chat = $state({
	turns: [] as ChatTurn[],
	session: undefined as string | undefined,
	/** Сколько вопросов ещё можно задать в этом диалоге. */
	left: CHAT_TURNS,
	/** Ассистент на сегодня закрыт: кончился дневной бюджет. */
	closed: false,
})
