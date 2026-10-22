import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, test } from 'node:test'
import { Client, InMemoryTransport, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

import { diskKnowledge } from '#frontend/lib/knowledge-disk.ts'

import { httpHandler } from './http.ts'
import { knowledgeTools } from './knowledge/tools.ts'
import { mcpServer } from './mcp.ts'
import { rateLimit } from './rate-limit.ts'

const tools = knowledgeTools(diskKnowledge())

const text = (result: { content: unknown }) => (result.content as { text: string }[])[0]!.text

async function memoryClient() {
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
	const client = new Client({ name: 'test', version: '0' })

	await mcpServer(tools, '0.0.0').connect(serverSide)
	await client.connect(clientSide)

	return client
}

test('mcp: инструменты, подсказка модели и prompt триажа', async () => {
	const client = await memoryClient()
	const { tools: list } = await client.listTools()

	assert.deepEqual(list.map((t) => t.name).sort(), [
		'get_article',
		'get_catalog',
		'get_red_flags',
		'list_injuries',
		'search_injuries',
	])

	assert.ok(list.every((t) => t.annotations?.readOnlyHint))
	assert.match(client.getInstructions() ?? '', /get_red_flags/)

	const prompt = await client.getPrompt({ name: 'sorebody_triage', arguments: { complaint: 'болит колено' } })

	assert.match(JSON.stringify(prompt.messages), /болит колено/)
})

test('mcp: поиск отдаёт JSON, ошибка базы -- isError с подсказкой', async () => {
	const client = await memoryClient()
	const found = await client.callTool({
		name: 'search_injuries',
		arguments: { query: 'хлопнуло в колене', limit: 3 },
	})

	assert.ok(JSON.parse(text(found)).some((hit: { slug: string }) => hit.slug === 'acl-tear'))

	const missing = await client.callTool({ name: 'get_article', arguments: { slug: 'no-such' } })

	assert.equal(missing.isError, true)
	assert.match(text(missing), /search_injuries/)
})

test('rateLimit: окно на адрес, после него счёт заново', () => {
	let time = 0
	const limit = rateLimit({ limit: 2, windowMs: 1000, now: () => time })

	assert.deepEqual(
		[limit('a'), limit('a'), limit('a'), limit('b')].map((r) => r.allowed),
		[true, true, false, true],
	)

	time = 1000

	assert.equal(limit('a').allowed, true)
})

let server: Server
let base: string

before(async () => {
	server = createServer(httpHandler({ tools, version: '0.0.0', hosts: ['127.0.0.1'], perMinute: 10 }))
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
	base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(() => server.close())

test('http: MCP по Streamable HTTP без сессий', async () => {
	const client = new Client({ name: 'test', version: '0' })

	await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)))

	const flags = await client.callTool({ name: 'get_red_flags', arguments: { slug: 'acl-tear' } })

	assert.match(text(flags), /103/)
	await client.close()
})

test('http: большое тело без Content-Length -- 413, не JSON -- 400', async () => {
	const big = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(`{"x":"${'a'.repeat(100 * 1024)}"}`))
			controller.close()
		},
	})
	const chunked = await fetch(`${base}/mcp`, { method: 'POST', body: big, duplex: 'half' } as RequestInit)

	assert.equal(chunked.status, 413)
	assert.equal((await fetch(`${base}/mcp`, { method: 'POST', body: 'не json' })).status, 400)
})

test('http: health, чужой путь, чужой Host, лимит запросов', async () => {
	assert.equal((await fetch(`${base}/api/health`)).status, 200)
	assert.equal((await fetch(`${base}/other`)).status, 404)
	// fetch не даёт сменить Host, поэтому чужой Host -- через node:http
	const { request } = await import('node:http')
	const status = await new Promise<number>((resolve) =>
		request(`${base}/mcp`, { method: 'POST', headers: { Host: 'evil.example' } }, (res) =>
			resolve(res.statusCode!),
		).end(),
	)

	assert.equal(status, 403)

	const statuses = async (method: string) => {
		const list: number[] = []

		for (let i = 0; i < 8; i++)
			list.push((await fetch(`${base}/mcp`, { method, body: method === 'POST' ? '{}' : null })).status)

		return list
	}

	assert.ok(
		(await statuses('OPTIONS')).every((s) => s === 204),
		'preflight лимит не тратит',
	)

	assert.equal((await statuses('POST')).at(-1), 429)
})
