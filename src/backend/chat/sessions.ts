import { randomUUID } from 'node:crypto'

import type { Message } from './openrouter.ts'

export type Session = {
	id: string
	/** История без системного промпта, только дописывается. */
	messages: Message[]
	/** Сколько реплик пользователя уже было. */
	turns: number
	/** Сколько диалог стоил, в долларах по `usage.cost`. */
	cost: number
	/** Искали ли травмы, проверены ли тревожные признаки, было ли уже напоминание о них. */
	searched: boolean
	flagged: boolean
	reminded: boolean
	/** Идёт ли сейчас реплика: вторую параллельно не начинаем. */
	busy: boolean
	seen: number
}

/**
 * Диалоги в памяти процесса: ни на диск, ни в лог. Живут `ttlMs` с последней
 * реплики, сверх `max` вытесняются самые давние. Перезапуск стирает всё -- так и задумано.
 */
export function sessionStore({ ttlMs, max, now = Date.now }: { ttlMs: number; max: number; now?: () => number }) {
	// Map помнит порядок вставки: обновлённую сессию переставляем в конец, первые -- самые давние
	const sessions = new Map<string, Session>()

	const sweep = () => {
		const time = now()

		for (const [id, session] of sessions) if (session.seen + ttlMs <= time && !session.busy) sessions.delete(id)

		for (const id of sessions.keys()) {
			if (sessions.size <= max) break

			sessions.delete(id)
		}
	}

	const touch = (session: Session) => {
		session.seen = now()
		sessions.delete(session.id)
		sessions.set(session.id, session)
	}

	return {
		create() {
			const session: Session = {
				id: randomUUID(),
				messages: [],
				turns: 0,
				cost: 0,
				searched: false,
				flagged: false,
				reminded: false,
				busy: false,
				seen: now(),
			}

			sessions.set(session.id, session)
			sweep()

			return session
		},

		/** Живая сессия по id; продлевает ей жизнь. */
		get(id: string) {
			sweep()

			const session = sessions.get(id)

			if (session) touch(session)

			return session
		},

		delete(id: string) {
			return sessions.delete(id)
		},

		get size() {
			return sessions.size
		},
	}
}

export type SessionStore = ReturnType<typeof sessionStore>
