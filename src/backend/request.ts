import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * Адрес посетителя. За общим Caddy адрес сокета -- сам Caddy, настоящий -- последний
 * в `X-Forwarded-For`: его дописывает Caddy, а то, что прислал клиент, стоит раньше
 * и подделывается.
 */
export const clientOf = (req: IncomingMessage) =>
	String(req.headers['x-forwarded-for'] ?? '')
		.split(',')
		.at(-1)
		?.trim() ||
	(req.socket.remoteAddress ?? '')

/**
 * Тело POST, не больше `max` байт: считаем байты сами, `Content-Length` может не быть
 * вовсе. Слишком большое -- `undefined`, читать дальше незачем.
 */
export async function readBody(req: IncomingMessage, max: number) {
	const chunks: Buffer[] = []
	let size = 0

	for await (const chunk of req as AsyncIterable<Buffer>) {
		size += chunk.length

		if (size > max) return undefined

		chunks.push(chunk)
	}

	return Buffer.concat(chunks).toString('utf8')
}

export function send(res: ServerResponse, status: number, text: string, headers: Record<string, string> = {}) {
	res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers }).end(text)
}
