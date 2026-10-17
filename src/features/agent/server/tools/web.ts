import { createHash, randomUUID } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js'
import { type ToolSet, tool } from 'ai'
import { z } from 'zod'

const ENDPOINT = 'https://search.parallel.ai/mcp'
const USER_AGENT = 'loupe (+https://github.com/ivanrdvc/loupe)'
const TIMEOUT_MS = 30_000

const publicUrl = z.url().refine((value) => {
  const url = new URL(value)
  return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
}, 'Use an HTTP or HTTPS URL without credentials.')

async function callWebTool(name: string, args: Record<string, unknown>, abortSignal?: AbortSignal) {
  const signal = AbortSignal.any([AbortSignal.timeout(TIMEOUT_MS), ...(abortSignal ? [abortSignal] : [])])
  signal.throwIfAborted()
  const client = new Client({ name: 'loupe', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    requestInit: { headers: { 'User-Agent': USER_AGENT } },
  })
  const options = { signal, timeout: TIMEOUT_MS }
  try {
    await client.connect(transport, options)
    const { tools } = await client.listTools({}, options)
    if (!tools.some((entry) => entry.name === name)) throw new Error(`Parallel does not expose ${name}.`)
    const result = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }, undefined, options))
    const content = result.content.filter((part) => part.type === 'text')
    if (result.isError) throw new Error(content.map((part) => part.text).join('\n') || 'Parallel web tool failed.')
    return result.structuredContent ?? { content }
  } finally {
    await client.close()
  }
}

export function makeWebTools(sessionId?: string): ToolSet {
  if (process.env.LOUPE_WEB_SEARCH === 'off') return {}
  // Correlate calls without forwarding loupe's conversation identifier.
  const session = createHash('sha256')
    .update(sessionId ?? randomUUID())
    .digest('hex')
  return {
    web_search: tool({
      description:
        'Search public web documentation with Parallel. Use only when the user asks for web research. Send generic technical terms, never private telemetry, prompts, identifiers, credentials or customer data. Returns source URLs and excerpts.',
      inputSchema: z.object({
        objective: z.string().min(1).describe('One public information goal.'),
        search_queries: z.array(z.string().min(1)).min(1).describe('Related keyword queries, ideally 3–6 words each.'),
      }),
      execute: (args, { abortSignal }) => callWebTool('web_search', { ...args, session_id: session }, abortSignal),
    }),
    web_fetch: tool({
      description:
        'Fetch excerpts from public HTTP/HTTPS pages via Parallel when the user asks to read a URL or search excerpts are insufficient. Never send private URLs, signed URLs, credentials or customer data.',
      inputSchema: z.object({
        urls: z.array(publicUrl).min(1).max(20),
        objective: z.string().max(200).optional().describe('Information to find on these pages.'),
        search_queries: z.array(z.string()).optional().describe('Queries that found these pages, if applicable.'),
      }),
      execute: (args, { abortSignal }) => callWebTool('web_fetch', { ...args, session_id: session }, abortSignal),
    }),
  }
}
