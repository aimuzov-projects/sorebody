import { createServer } from 'node:http'

import { chatHandler, QUOTA } from './chat/http.ts'
import { openRouter } from './chat/openrouter.ts'
import { httpHandler } from './http.ts'
import { loadKnowledge } from './knowledge/load.ts'
import { knowledgeTools } from './knowledge/tools.ts'
import { VERSION } from './version.ts'

/**
 * Бэкенд Sorebody в контейнере за общим Caddy: публичный MCP на `/mcp` и чат на `/api/chat`.
 * Настройки -- из окружения, по умолчанию -- как на сервере. Чат включается явно
 * (`CHAT_ENABLED=1`) и только с ключом OpenRouter.
 */
const port = Number(process.env.PORT ?? 8787)
const hosts = (process.env.HOSTS ?? 'sorebody.aimuzov.online,localhost,127.0.0.1').split(',')
const knowledge = loadKnowledge()
const tools = knowledgeTools(knowledge)
const key = process.env.OPENROUTER_API_KEY

const chat =
	process.env.CHAT_ENABLED === '1' && key
		? chatHandler({
				complete: openRouter({ key }),
				tools,
				origins: (process.env.CHAT_ORIGINS ?? 'https://sorebody.aimuzov.online').split(','),
				quota: {
					perMinute: Number(process.env.CHAT_PER_MINUTE ?? QUOTA.perMinute),
					perDay: Number(process.env.CHAT_PER_DAY ?? QUOTA.perDay),
					dialogs: Number(process.env.CHAT_DIALOGS_PER_DAY ?? QUOTA.dialogs),
					dollars: Number(process.env.CHAT_DOLLARS_PER_DAY ?? QUOTA.dollars),
				},
			})
		: undefined

const handler = httpHandler({
	tools,
	version: VERSION,
	hosts,
	perMinute: Number(process.env.MCP_PER_MINUTE ?? 60),
	chat,
})

createServer((req, res) => {
	handler(req, res).catch((error: unknown) => {
		console.error(error)

		if (!res.headersSent) res.writeHead(500).end()
	})
}).listen(port, () =>
	console.log(`sorebody backend: ${knowledge.injuries.length} injuries, chat ${chat ? 'on' : 'off'}, port ${port}`),
)
