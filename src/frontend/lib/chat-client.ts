/** Тревожный признак из `get_red_flags`: что делать и насколько срочно. */
export type ChatAlarm = { text: string; urgency: 'call' | 'today' | 'soon'; action: string }

export type ChatFlags = { slug: string; title: string; url: string; alarms: ChatAlarm[] }[]

export type ChatCard = { slug: string; title: string; url: string }

/** Почему ответа нет: у каждой причины свой текст в виджете. */
export type ChatFailure = 'rate' | 'closed' | 'turns' | 'cost' | 'expired' | 'busy' | 'unavailable'

/** События ответа на реплику -- то же, что шлёт `/api/chat`, плюс отказы до начала потока. */
export type ChatEvent =
	| { type: 'session'; id: string }
	| { type: 'status'; step: 'red-flags' | 'search' | 'article' }
	| { type: 'alarms'; flags: ChatFlags }
	| { type: 'cards'; cards: ChatCard[] }
	| { type: 'text'; text: string }
	| { type: 'done'; turnsLeft: number }
	| { type: 'error'; reason: ChatFailure; reopensAt?: string }

const ENDPOINT = '/api/chat'

/** Блоки потока SSE: `event:` и `data:` через пустую строку. Кусок без конца ждёт следующего. */
async function* blocks(body: ReadableStream<Uint8Array>) {
	const decoder = new TextDecoder()
	let buffer = ''

	for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
		buffer += decoder.decode(chunk, { stream: true })

		for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
			yield buffer.slice(0, end)
			buffer = buffer.slice(end + 2)
		}
	}
}

function parse(block: string): ChatEvent | undefined {
	const type = block.match(/^event: (.+)$/m)?.[1]
	const data = block.match(/^data: (.+)$/m)?.[1]

	if (!type || !data) return undefined

	try {
		return { type, ...JSON.parse(data) } as ChatEvent
	} catch {
		return undefined
	}
}

const FAILURES: Record<number, ChatFailure> = { 404: 'expired', 409: 'busy', 429: 'rate', 503: 'closed' }

/**
 * Реплика в чат: события ответа по мере прихода. Отказ до потока и оборванный поток -- тоже
 * событие `error`, чтобы виджету было что показать в любом случае.
 */
export async function* sendReply(
	{ message, session, sport, article }: { message: string; session?: string; sport?: string; article?: string },
	{ fetch = globalThis.fetch, signal }: { fetch?: typeof globalThis.fetch; signal?: AbortSignal } = {},
): AsyncGenerator<ChatEvent> {
	let res: Response

	try {
		res = await fetch(ENDPOINT, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message, session, sport, article }),
			signal,
		})
	} catch {
		yield { type: 'error', reason: 'unavailable' }

		return
	}

	if (!res.ok || !res.body) {
		const body = await res.json().catch(() => ({}))

		yield { type: 'error', reason: FAILURES[res.status] ?? 'unavailable', reopensAt: body.reopensAt }

		return
	}

	let finished = false

	try {
		for await (const block of blocks(res.body)) {
			const event = parse(block)

			if (!event) continue

			if (event.type === 'done' || event.type === 'error') finished = true

			yield event
		}
	} catch {
		// Обрыв сети посреди ответа: ниже скажем, что ответа нет
	}

	if (!finished) yield { type: 'error', reason: 'unavailable' }
}

/** Открыт ли чат сегодня; не ответил -- считаем открытым, реплика сама скажет, если нет. */
export async function chatStatus({ fetch = globalThis.fetch } = {}): Promise<{ open: boolean; reopensAt?: string }> {
	try {
		const res = await fetch(ENDPOINT)

		return res.ok ? await res.json() : { open: true }
	} catch {
		return { open: true }
	}
}

/** Стереть диалог на сервере; ошибка неважна -- он и так исчезнет через полчаса. */
export function forgetSession(session: string, { fetch = globalThis.fetch } = {}) {
	return fetch(`${ENDPOINT}?session=${encodeURIComponent(session)}`, { method: 'DELETE' }).catch(() => undefined)
}

const ORDER = { call: 0, today: 1, soon: 2 } as const

/**
 * Признаки из всех найденных травм одним списком: без повторов, самые срочные первыми. По зоне
 * инструмент отдаёт признаки каждой травмы, и одна фраза встречается у нескольких.
 */
export function mergeAlarms(flags: ChatFlags) {
	const seen = new Map<string, ChatAlarm>()

	for (const alarm of flags.flatMap((flag) => flag.alarms)) {
		const key = alarm.text.toLowerCase()
		const known = seen.get(key)

		if (!known || ORDER[alarm.urgency] < ORDER[known.urgency]) seen.set(key, alarm)
	}

	return [...seen.values()].sort((a, b) => ORDER[a.urgency] - ORDER[b.urgency])
}
