type ToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } }

/**
 * Ответ ассистента храним целиком, как пришёл: в нём `reasoning_details` -- рассуждения
 * Claude, которые нужно вернуть без изменений, иначе модель их потеряет.
 */
export type AssistantMessage = { role: 'assistant'; content?: string | null; tool_calls?: ToolCall[] } & Record<
	string,
	unknown
>

export type Message =
	| { role: 'system' | 'user'; content: string }
	| { role: 'tool'; tool_call_id: string; content: string }
	| AssistantMessage

type Completion = {
	provider?: string
	choices: { finish_reason: string | null; message: AssistantMessage }[]
	usage?: {
		prompt_tokens: number
		completion_tokens: number
		/** Сколько списано кредитов, в долларах. */
		cost?: number
		prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number }
	}
}

/** Один запрос к модели: история и инструменты. В тестах -- подделка. */
export type Complete = (request: { messages: Message[]; tools: unknown[] }) => Promise<Completion>

/**
 * OpenRouter не ответил: код ответа или сбой сети и таймаут (`status` 0). Тело ответа в
 * сообщение не попадает -- в нём может быть текст реплики, а сообщение идёт в лог.
 */
export class OpenRouterError extends Error {
	readonly status: number

	constructor(status: number, reason = `ответил ${status}`) {
		super(`OpenRouter ${reason}`)
		this.status = status
	}
}

/** Модель по умолчанию; другую задаёт `CHAT_MODEL`, slug модели в OpenRouter. */
export const MODEL = 'anthropic/claude-opus-5.5'

/**
 * Клиент OpenRouter для чата, по итогам eval (docs/superpowers/specs, «Результаты eval»):
 * Opus 5.5 с `effort: "low"`, только ZDR-эндпоинты, кэш промпта включён явно -- сам он
 * для Claude не включается. Без стриминга: `reasoning_details` приходят целыми.
 */
export function openRouter({
	key,
	model = MODEL,
	maxTokens = 1200,
	timeoutMs = 90_000,
	fetch = globalThis.fetch,
}: {
	key: string
	model?: string
	maxTokens?: number
	timeoutMs?: number
	fetch?: typeof globalThis.fetch
}): Complete {
	const post = async (body: string) => {
		try {
			return await fetch('https://openrouter.ai/api/v1/chat/completions', {
				method: 'POST',
				headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
				signal: AbortSignal.timeout(timeoutMs),
				body,
			})
		} catch (error) {
			throw new OpenRouterError(0, error instanceof Error ? error.name : 'недоступен')
		}
	}

	return async ({ messages, tools }) => {
		const res = await post(
			JSON.stringify({
				model,
				messages,
				tools,
				tool_choice: 'auto',
				max_tokens: maxTokens,
				reasoning: { effort: 'low' },
				cache_control: { type: 'ephemeral' },
				provider: { zdr: true, data_collection: 'deny' },
				usage: { include: true },
			}),
		)

		if (!res.ok) throw new OpenRouterError(res.status)

		try {
			return (await res.json()) as Completion
		} catch {
			throw new OpenRouterError(res.status, 'прислал не JSON')
		}
	}
}
