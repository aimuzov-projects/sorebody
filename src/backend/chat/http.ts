import type { IncomingMessage, ServerResponse } from 'node:http'
import * as z from 'zod/v4'

import type { knowledgeTools } from '#backend/knowledge/tools.ts'
import { readBody, send } from '#backend/request.ts'

import { OpenRouterError, type Complete } from './openrouter.ts'
import { chatSystem, sportNote } from './prompt.ts'
import { sessionStore, type SessionStore } from './sessions.ts'
import { chatTools } from './tools.ts'
import { ChatLimitError, chatTurn, LIMITS, type ChatEvent } from './turn.ts'

/** Реплика -- до 1 000 символов, с запасом на JSON и кириллицу в UTF-8. */
const MAX_BODY = 8 * 1024

const Request = z.object({
	/** Диалог, который продолжаем; без него -- новый. */
	session: z.string().max(64).optional(),
	message: z.string().trim().min(1).max(1000),
	/** Спорт, выбранный на сайте, slug. */
	sport: z.string().max(32).optional(),
})

/** Почему реплика не получила ответа: виджет показывает на это свой текст. */
type Failure = 'turns' | 'cost' | 'unavailable'

type Options = {
	complete: Complete
	tools: ReturnType<typeof knowledgeTools>
	/** Откуда разрешены запросы: чат только для своего сайта, CORS не открываем. */
	origins: string[]
	sessions?: SessionStore
	limits?: typeof LIMITS
}

/**
 * `POST /api/chat` -- реплика, ответ потоком SSE: `session`, затем события реплики
 * (`status`, `alarms`, `cards`, `text`), в конце `done` или `error`. `DELETE /api/chat?session=…` --
 * стереть диалог. Текст реплик и ответов не логируется нигде.
 */
export function chatHandler({
	complete,
	tools,
	origins,
	sessions = sessionStore({ ttlMs: 30 * 60_000, max: 1000 }),
	limits = LIMITS,
}: Options) {
	const system = chatSystem(tools)
	const chat = chatTools(tools)
	const sports = new Map(tools.catalog().sports.map((s) => [s.slug, s.title]))

	return async (req: IncomingMessage, res: ServerResponse) => {
		if (!origins.includes(String(req.headers.origin ?? ''))) return send(res, 403, 'Forbidden')

		const url = new URL(req.url ?? '/', 'http://localhost')

		if (req.method === 'DELETE') {
			sessions.delete(url.searchParams.get('session') ?? '')

			return void res.writeHead(204).end()
		}

		if (req.method !== 'POST') return send(res, 405, 'Method not allowed', { Allow: 'POST, DELETE' })

		const raw = await readBody(req, MAX_BODY)

		if (raw === undefined) return send(res, 413, 'Request too large')

		let parsed: z.infer<typeof Request>

		try {
			parsed = Request.parse(JSON.parse(raw))
		} catch {
			return send(res, 400, 'Bad request')
		}

		const session = parsed.session ? sessions.get(parsed.session) : sessions.create()

		if (!session) return send(res, 404, 'Session expired')

		if (session.busy) return send(res, 409, 'Busy')

		res.writeHead(200, {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-store',
			// Caddy и прочие прокси не должны копить поток
			'X-Accel-Buffering': 'no',
		})

		const write = (type: string, data: object) => {
			if (!res.destroyed) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`)
		}
		const emit = ({ type, ...data }: ChatEvent) => write(type, data)
		const fail = (reason: Failure) => write('error', { reason })
		const sport = parsed.sport && sports.get(parsed.sport)

		write('session', { id: session.id })
		session.busy = true

		try {
			await chatTurn({
				complete,
				system,
				tools: chat,
				session,
				message: parsed.message,
				note: sport && session.turns === 0 ? sportNote(sport, parsed.sport!) : undefined,
				emit,
				limits,
			})

			write('done', { turnsLeft: limits.turns - session.turns })
		} catch (error) {
			if (error instanceof ChatLimitError) fail(error.reason)
			else if (error instanceof OpenRouterError) {
				// Только код и тип: в теле ответа OpenRouter может быть текст реплики
				console.error(`chat: ${error.message}`)
				fail('unavailable')
			} else throw error
		} finally {
			session.busy = false
			res.end()
		}
	}
}
