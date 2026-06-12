import type { JsonValue } from '#/lib/json'
import type { McpServerRef, McpTool } from './types'

const REQUEST_TIMEOUT_MS = 5000

type JsonRpcToolsList = {
  result?: {
    tools?: Array<{
      name?: unknown
      description?: unknown
      inputSchema?: unknown
      input_schema?: unknown
    }>
  }
  error?: { message?: unknown }
}

export async function listServerTools(ref: McpServerRef): Promise<McpTool[]> {
  if (!ref.endpoint) return []
  if (ref.transport !== 'streamable-http' && ref.transport !== 'unknown') return []

  const data = await postToolsList(ref.endpoint)
  const tools = data.result?.tools
  if (!Array.isArray(tools)) {
    const message =
      typeof data.error?.message === 'string' ? data.error.message : 'MCP tools/list returned no tools array'
    throw new Error(message)
  }

  const out: McpTool[] = []
  for (const tool of tools) {
    if (typeof tool.name !== 'string' || tool.name.length === 0) continue
    out.push({
      id: `${ref.id}:${tool.name}`,
      serverId: ref.id,
      serverName: ref.name,
      name: tool.name,
      description: typeof tool.description === 'string' ? tool.description : undefined,
      // Value came from resp.json(), which can only produce JSON-shaped output.
      inputSchema: (tool.inputSchema ?? tool.input_schema) as JsonValue | undefined,
    })
  }
  return out
}

async function postToolsList(endpoint: string): Promise<JsonRpcToolsList> {
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'loupe-tools-list', method: 'tools/list', params: {} }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return (await resp.json()) as JsonRpcToolsList
}
