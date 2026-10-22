import type { IncomingMessage, ServerResponse } from 'node:http'
import * as z from 'zod/v4'

import type { knowledgeTools } from '#backend/knowledge/tools.ts'
import { rateLimit } from '#backend/rate-limit.ts'
import { clientOf, readBody, send } from '#backend/request.ts'

import { dailyCounter } from './daily.ts'
import { OpenRouterError, type Complete } from './openrouter.ts'
import { chatSystem, pageNote } from './prompt.ts'
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
	/** Статья, со страницы которой спрашивают, slug. */
	article: z.string().max(80).optional(),
})

/** Почему реплика не получила ответа: виджет показывает на это свой текст. */
type Failure = 'turns' | 'cost' | 'unavailable'

/**
 * Лимиты чата из дизайна. Деньги -- по `usage.cost`, без комиссии OpenRouter 5,5% за покупку
 * кредитов: $1,50 в сутки с ней дают ~$49 за 31 день.
 */
export const QUOTA = {
	/** Реплик в минуту и в сутки с одного адреса. */
	perMinute: 5,
	perDay: 12,
	/** Новых диалогов в сутки на весь сайт. */
	dialogs: 40,
	/** Долларов в сутки на весь сайт. */
	dollars: 1.5,
}

type Options = {
	complete: Complete
	tools: ReturnType<typeof knowledgeTools>
	/** Откуда разрешены запросы: чат только для своего сайта, CORS не открываем. */
	origins: string[]
	sessions?: SessionStore
	limits?: typeof LIMITS
	quota?: typeof QUOTA
	now?: () => number
}

function json(res: ServerResponse, status: number, data: object, headers: Record<string, string> = {}) {
	res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }).end(
		JSON.stringify(data),
	)
}

/**
 * `POST /api/chat` -- реплика, ответ потоком SSE: `session`, затем события реплики
 * (`status`, `alarms`, `cards`, `text`), в конце `done` или `error`. `DELETE /api/chat?session=…` --
 * стереть диалог, `GET /api/chat` -- открыт ли чат сегодня. Текст реплик и ответов не
 * логируется нигде.
 *
 * Отказы до начала ответа -- JSON с `reason`: `rate` (429, частит один адрес) и `closed` (503,
 * на сегодня кончились деньги или диалоги, с `reopensAt`).
 */
export function chatHandler({
	complete,
	tools,
	origins,
	sessions = sessionStore({ ttlMs: 30 * 60_000, max: 1000 }),
	limits = LIMITS,
	quota = QUOTA,
	now = Date.now,
}: Options) {
	const system = chatSystem(tools)
	const chat = chatTools(tools)
	const sports = new Map(tools.catalog().sports.map((s) => [s.slug, s.title]))
	const articles = new Map(tools.listInjuries().map((i) => [i.slug, i.title]))
	const perMinute = rateLimit({ limit: quota.perMinute, windowMs: 60_000, now })
	const perDay = rateLimit({ limit: quota.perDay, windowMs: 86_400_000, now })
	const dialogs = dailyCounter({ limit: quota.dialogs, now })
	const dollars = dailyCounter({ limit: quota.dollars, now })

	// Деньги считаем по каждому ответу модели: реплика, начатая до потолка, доживает до конца
	const counted: Complete = async (request) => {
		const body = await complete(request)

		dollars.add(body.usage?.cost ?? 0)

		return body
	}

	const closed = (res: ServerResponse) => json(res, 503, { reason: 'closed', reopensAt: dollars.resetsAt })

	return async (req: IncomingMessage, res: ServerResponse) => {
		// Тот же сайт шлёт GET без Origin, а ответ -- ни о ком: проверку сайта не делаем
		if (req.method === 'GET')
			return json(
				res,
				200,
				dollars.open && dialogs.open ? { open: true } : { open: false, reopensAt: dollars.resetsAt },
			)

		if (!origins.includes(String(req.headers.origin ?? ''))) return send(res, 403, 'Forbidden')

		const url = new URL(req.url ?? '/', 'http://localhost')

		if (req.method === 'DELETE') {
			sessions.delete(url.searchParams.get('session') ?? '')

			return void res.writeHead(204).end()
		}

		if (req.method !== 'POST') return send(res, 405, 'Method not allowed', { Allow: 'GET, POST, DELETE' })

		// Минутное окно проверяем первым: частящий адрес не тратит суточный запас
		const client = clientOf(req)
		const minute = perMinute(client)
		const day = minute.allowed ? perDay(client) : minute

		if (!day.allowed) return json(res, 429, { reason: 'rate' }, { 'Retry-After': String(day.retryAfter) })

		const raw = await readBody(req, MAX_BODY)

		if (raw === undefined) return send(res, 413, 'Request too large')

		let parsed: z.infer<typeof Request>

		try {
			parsed = Request.parse(JSON.parse(raw))
		} catch {
			return send(res, 400, 'Bad request')
		}

		if (!dollars.open || (!parsed.session && !dialogs.open)) return closed(res)

		const session = parsed.session ? sessions.get(parsed.session) : sessions.create()

		if (!session) return send(res, 404, 'Session expired')

		if (!parsed.session) dialogs.add(1)

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
		// Чужие slug не доходят до модели: в служебное сообщение -- только то, что есть в базе
		const sport = parsed.sport && sports.get(parsed.sport)
		const article = parsed.article && articles.get(parsed.article)
		const note = pageNote({
			sport: sport ? { title: sport, slug: parsed.sport! } : undefined,
			article: article ? { title: article, slug: parsed.article! } : undefined,
		})

		write('session', { id: session.id })
		session.busy = true

		try {
			await chatTurn({
				complete: counted,
				system,
				tools: chat,
				session,
				message: parsed.message,
				note: session.turns === 0 ? note : undefined,
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
