import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { JsonValue } from '#/lib/json'
import type { McpServerRef, McpTool, McpToolAnnotations } from './types'

const REQUEST_TIMEOUT_MS = 5000

export async function listServerTools(ref: McpServerRef): Promise<McpTool[]> {
  if (!ref.endpoint) return []
  if (ref.transport !== 'streamable-http' && ref.transport !== 'unknown') return []

  const client = new Client({ name: 'loupe', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(ref.endpoint))
  try {
    await client.connect(transport, { timeout: REQUEST_TIMEOUT_MS })
    const { tools } = await client.listTools({}, { timeout: REQUEST_TIMEOUT_MS })
    return tools.map((tool) => ({
      id: `${ref.id}:${tool.name}`,
      serverId: ref.id,
      serverName: ref.name,
      name: tool.name,
      title: typeof tool.title === 'string' ? tool.title : undefined,
      description: typeof tool.description === 'string' ? tool.description : undefined,
      inputSchema: tool.inputSchema as unknown as JsonValue,
      annotations: tool.annotations as McpToolAnnotations | undefined,
    }))
  } finally {
    await client.close()
  }
}
