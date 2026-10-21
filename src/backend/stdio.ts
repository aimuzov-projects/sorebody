import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'

import { loadKnowledge } from './knowledge/load.ts'
import { knowledgeTools } from './knowledge/tools.ts'
import { mcpServer } from './mcp.ts'
import { VERSION } from './version.ts'

/**
 * MCP по stdio: подключить локальную сборку к Claude Desktop или инспектору
 * без сервера. База -- из `dist/knowledge.json` после `npm run build` или из пути
 * в `KNOWLEDGE`.
 */
const server = mcpServer(knowledgeTools(loadKnowledge()), VERSION)

await server.connect(new StdioServerTransport())
