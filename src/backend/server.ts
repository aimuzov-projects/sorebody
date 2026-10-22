import { createServer } from 'node:http'

import { httpHandler } from './http.ts'
import { loadKnowledge } from './knowledge/load.ts'
import { knowledgeTools } from './knowledge/tools.ts'
import { VERSION } from './version.ts'

/**
 * Бэкенд Sorebody в контейнере за общим Caddy: публичный MCP на `/mcp`.
 * Настройки -- из окружения, по умолчанию -- как на сервере.
 */
const port = Number(process.env.PORT ?? 8787)
const hosts = (process.env.HOSTS ?? 'sorebody.aimuzov.online,localhost,127.0.0.1').split(',')
const knowledge = loadKnowledge()

const handler = httpHandler({
	tools: knowledgeTools(knowledge),
	version: VERSION,
	hosts,
	perMinute: Number(process.env.MCP_PER_MINUTE ?? 60),
})

createServer((req, res) => {
	handler(req, res).catch((error: unknown) => {
		console.error(error)

		if (!res.headersSent) res.writeHead(500).end()
	})
}).listen(port, () => console.log(`sorebody backend: ${knowledge.injuries.length} injuries, port ${port}`))
