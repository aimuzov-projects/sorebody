import type { IncomingMessage, ServerResponse } from 'node:http'
import { hostHeaderValidation, NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'

import type { knowledgeTools } from './knowledge/tools.ts'
import { mcpServer } from './mcp.ts'
import { rateLimit } from './rate-limit.ts'

type Options = {
	tools: ReturnType<typeof knowledgeTools>
	version: string
	/** Домены, на которые отвечаем: защита от DNS rebinding, чужой `Host` -- 403. */
	hosts: string[]
	/** Запросов к /mcp в минуту с одного адреса. */
	perMinute: number
}

/** JSON-RPC запрос к базе -- килобайт-другой. Больше -- не к нам. */
const MAX_BODY = 64 * 1024

/**
 * Заголовки для MCP-клиентов из браузера (инспектор, веб-чаты). Сервер публичный
 * и только читает, так что любой origin безопасен: кук и приватных данных у него нет.
 */
const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
	'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version',
}

/**
 * Адрес посетителя. За общим Caddy адрес сокета -- сам Caddy, настоящий -- последний
 * в `X-Forwarded-For`: его дописывает Caddy, а то, что прислал клиент, стоит раньше
 * и подделывается.
 */
const clientOf = (req: IncomingMessage) =>
	String(req.headers['x-forwarded-for'] ?? '')
		.split(',')
		.at(-1)
		?.trim() ||
	(req.socket.remoteAddress ?? '')

/**
 * Тело POST, не больше `MAX_BODY`: считаем байты сами, `Content-Length` может не быть
 * вовсе. Слишком большое -- `undefined`, читать дальше незачем.
 */
async function readBody(req: IncomingMessage) {
	const chunks: Buffer[] = []
	let size = 0

	for await (const chunk of req as AsyncIterable<Buffer>) {
		size += chunk.length

		if (size > MAX_BODY) return undefined

		chunks.push(chunk)
	}

	return Buffer.concat(chunks).toString('utf8')
}

function send(res: ServerResponse, status: number, text: string, headers: Record<string, string> = {}) {
	res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers }).end(text)
}

/**
 * Обработчик HTTP бэкенда: `/mcp` -- публичный MCP по Streamable HTTP без сессий,
 * `/api/health` -- для проверки контейнера. Остальное -- 404: сайт отдаёт nginx,
 * сюда Caddy шлёт только своё.
 */
export function httpHandler({ tools, version, hosts, perMinute }: Options) {
	const validateHost = hostHeaderValidation(hosts)
	const limit = rateLimit({ limit: perMinute, windowMs: 60_000 })

	return async (req: IncomingMessage, res: ServerResponse) => {
		const path = new URL(req.url ?? '/', 'http://localhost').pathname

		if (path === '/api/health') return send(res, 200, 'ok')

		if (path !== '/mcp') return send(res, 404, 'Not found')

		if (!validateHost(req, res)) return

		if (req.method === 'OPTIONS') return void res.writeHead(204, CORS).end()

		for (const [name, value] of Object.entries(CORS)) res.setHeader(name, value)

		const { allowed, retryAfter } = limit(clientOf(req))

		if (!allowed) return send(res, 429, 'Too many requests', { 'Retry-After': String(retryAfter) })

		let body: unknown

		if (req.method === 'POST') {
			const raw = await readBody(req)

			if (raw === undefined) return send(res, 413, 'Request too large')

			try {
				body = JSON.parse(raw)
			} catch {
				return send(res, 400, 'Invalid JSON')
			}
		}

		const server = mcpServer(tools, version)
		const transport = new NodeStreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		})

		res.on('close', () => void server.close())

		await server.connect(transport)
		await transport.handleRequest(req, res, body)
	}
}
