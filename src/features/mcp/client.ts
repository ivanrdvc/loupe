import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { type ListToolsResultSchema, ToolSchema } from '@modelcontextprotocol/sdk/types.js'
import type { JsonValue } from '#/lib/json'
import type { McpServerRef, McpTool, McpToolAnnotations } from './types'

const REQUEST_TIMEOUT_MS = 5000

// ListToolsResultSchema rejects the whole response if any one tool's schema trips
// the SDK's over-strict validator (e.g. boolean subschema `"body": true`). Fetch
// raw so one tool can't zero the server; per-tool detection happens below.
const PASSTHROUGH = {
  safeParse: (data: unknown) => ({ success: true as const, data }),
} as unknown as typeof ListToolsResultSchema

export async function listServerTools(ref: McpServerRef): Promise<McpTool[]> {
  if (!ref.endpoint) return []
  if (ref.transport !== 'streamable-http' && ref.transport !== 'unknown') return []

  const client = new Client({ name: 'loupe', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(ref.endpoint))
  try {
    await client.connect(transport, { timeout: REQUEST_TIMEOUT_MS })
    const { tools } = await client.request({ method: 'tools/list', params: {} }, PASSTHROUGH, {
      timeout: REQUEST_TIMEOUT_MS,
    })
    return tools.map((tool) => ({
      id: `${ref.id}:${tool.name}`,
      serverId: ref.id,
      serverName: ref.name,
      name: tool.name,
      title: typeof tool.title === 'string' ? tool.title : undefined,
      description: typeof tool.description === 'string' ? tool.description : undefined,
      inputSchema: tool.inputSchema as unknown as JsonValue,
      annotations: tool.annotations as McpToolAnnotations | undefined,
      schemaNote: schemaDeviation(tool),
    }))
  } finally {
    await client.close()
  }
}

function schemaDeviation(tool: unknown): string | undefined {
  const check = ToolSchema.safeParse(tool)
  if (check.success) return undefined
  const issue = check.error.issues[0]
  if (!issue) return undefined
  const path = issue.path.map(String)
  const value = path.reduce<unknown>((acc, key) => (acc == null ? acc : (acc as Record<string, unknown>)[key]), tool)
  return path.length ? `${path.join('.')} = ${JSON.stringify(value)}` : issue.message
}
