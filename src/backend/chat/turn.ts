import { keepKnownLinks, localLinks, urlsIn } from './links.ts'
import { maskContacts } from './mask.ts'
import type { Complete, Message } from './openrouter.ts'
import { RED_FLAGS_REMINDER } from './prompt.ts'
import type { Session } from './sessions.ts'
import type { chatTools, ToolEvent } from './tools.ts'

/** Что видит виджет: шаг поиска, признаки и карточки из инструментов, ответ модели. */
export type ChatEvent =
	ToolEvent | { type: 'status'; step: 'red-flags' | 'search' | 'article' } | { type: 'text'; text: string }

/** Потолки диалога из дизайна: экономный режим, чтобы уложиться в $50 в месяц. */
export const LIMITS = { turns: 4, cost: 0.3, toolCalls: 6 }

/** Диалог упёрся в потолок: дальше -- новый диалог или статья. */
export class ChatLimitError extends Error {
	readonly reason: 'turns' | 'cost'

	constructor(reason: 'turns' | 'cost') {
		super(reason === 'turns' ? 'Реплик в диалоге больше нельзя' : 'Диалог исчерпал свой бюджет')
		this.reason = reason
	}
}

export const FALLBACK =
	'Не получилось ответить. Попробуйте описать иначе или найдите травму через поиск по справочнику.'

const STEPS: Record<string, 'red-flags' | 'search' | 'article'> = {
	get_red_flags: 'red-flags',
	search_injuries: 'search',
	get_article: 'article',
}

const TOOL_LIMIT = 'Ошибка: вызовов на эту реплику больше нельзя, ответь по тому, что уже нашёл.'

type Options = {
	complete: Complete
	system: string
	tools: ReturnType<typeof chatTools>
	session: Session
	message: string
	/** Служебное сообщение о странице, с которой спрашивают, только к первой реплике. */
	note?: string
	/**
	 * Признаки статьи, которые модель уже получила в служебном сообщении. Сама она их тогда не
	 * запросит, поэтому карточки показывает сервер, если за реплику признаков не было.
	 */
	alarms?: Extract<ToolEvent, { type: 'alarms' }>['flags']
	emit: (event: ChatEvent) => void
	limits?: typeof LIMITS
}

/**
 * Одна реплика пользователя: модель зовёт инструменты, пока не ответит. История только
 * дописывается -- так требуют рассуждения Claude, -- поэтому напоминание о признаках
 * не дописывает ответ, а повторяет тот же запрос с напоминанием в конце.
 */
export async function chatTurn({
	complete,
	system,
	tools,
	session,
	message,
	note,
	alarms,
	emit,
	limits = LIMITS,
}: Options) {
	if (session.turns >= limits.turns) throw new ChatLimitError('turns')

	if (session.cost >= limits.cost) throw new ChatLimitError('cost')

	session.turns++
	session.messages.push({ role: 'user', content: maskContacts(message) })

	if (note) session.messages.push({ role: 'system', content: note })

	if (alarms) session.flagged = true

	let calls = 0
	let alarmed = false
	// Найденные статьи: под ответом показываем только те, на которые модель сослалась
	let found: Extract<ToolEvent, { type: 'cards' }>['cards'] = []

	// Запас сверх потолка вызовов: ответ после отказа в вызове и напоминание
	for (let step = 0; step < limits.toolCalls + 3; step++) {
		const messages: Message[] = [{ role: 'system', content: system }, ...session.messages]
		const body = await complete({ messages, tools: tools.definitions })

		session.cost += body.usage?.cost ?? 0

		const choice = body.choices[0]

		if (!choice) break

		const { message: reply, finish_reason } = choice
		const toolCalls = reply.tool_calls ?? []

		if (!toolCalls.length && session.searched && !session.flagged && !session.reminded) {
			session.reminded = true
			session.messages.push({ role: 'system', content: RED_FLAGS_REMINDER })
			continue
		}

		session.messages.push(reply)

		if (toolCalls.length) {
			for (const call of toolCalls) {
				const { name, arguments: args } = call.function
				const over = ++calls > limits.toolCalls
				const step = STEPS[name]

				if (!over && step) emit({ type: 'status', step })

				const { content, event } = over ? { content: TOOL_LIMIT } : tools.run(name, args)

				if (event?.type === 'alarms') {
					session.flagged = alarmed = true
					emit(event)
				}

				if (event?.type === 'cards') {
					session.searched = true
					found = [...found, ...event.cards.filter((c) => !found.some((f) => f.slug === c.slug))]
				}

				session.messages.push({ role: 'tool', tool_call_id: call.id, content })
			}

			continue
		}

		if (alarms?.length && !alarmed) emit({ type: 'alarms', flags: alarms })

		const text = reply.content?.trim()
		const known = new Set(session.messages.flatMap((m) => (m.role === 'tool' ? urlsIn(m.content) : [])))
		const answer =
			text && finish_reason !== 'content_filter'
				? localLinks(keepKnownLinks(text, { site: tools.site, known }), tools)
				: FALLBACK
		const cited = found.filter((card) => answer.includes(`/${card.slug}/`))

		if (cited.length) emit({ type: 'cards', cards: cited })

		emit({ type: 'text', text: answer })

		return
	}

	emit({ type: 'text', text: FALLBACK })
}
