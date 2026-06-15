// Deterministic stand-in for the user's agent endpoint. Speaks the OpenAI
// Responses shape callAgent parses (output_text + usage) on /v1/responses, and
// serves real MCP servers (SDK streamable-HTTP transport) under /mcp/* for the
// MCP-page e2e. Wired via DATASET_RUN_ENDPOINT / MCP_REGISTRY_REFS_JSON.
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const port = Number(process.env.FAKE_AGENT_PORT ?? 3211)

const obj = (props) => ({ type: 'object', properties: props })

// Keyed by /mcp/<key>. "search" appears on weather + search with different
// descriptions (cross-server conflict); "rm" trips empty-description + schema +
// name-shape; notes mixes snake_case and camelCase.
const MCP_TOOLS = {
  weather: [
    {
      name: 'get_weather',
      description: 'Return the current weather for a location.',
      inputSchema: obj({ location: { type: 'string' } }),
    },
    {
      name: 'get_forecast',
      description: 'Return a multi-day weather forecast for a location.',
      inputSchema: obj({ location: { type: 'string' }, days: { type: 'number' } }),
    },
    {
      name: 'search',
      description: 'Search weather data sources for a place.',
      inputSchema: obj({ query: { type: 'string' } }),
    },
  ],
  search: [
    {
      name: 'search',
      description: 'Full-text search across indexed documents.',
      inputSchema: obj({ query: { type: 'string' } }),
    },
    {
      name: 'index_document',
      description: 'Index a document so it can be searched later.',
      inputSchema: obj({ id: { type: 'string' }, body: { type: 'string' } }),
    },
    { name: 'rm', description: '', inputSchema: obj({}) },
  ],
  notes: [
    {
      name: 'create_note',
      description: 'Create a note with a title and body.',
      inputSchema: obj({ title: { type: 'string' }, body: { type: 'string' } }),
    },
    {
      name: 'listNotes',
      description: 'List all notes in the workspace.',
      inputSchema: obj({ limit: { type: 'number' } }),
    },
    { name: 'get note', description: 'Fetch a single note by its id.', inputSchema: obj({ id: { type: 'string' } }) },
  ],
}

function buildMcpServer(name, tools) {
  const server = new Server({ name, version: '1.0.0' }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))
  return server
}

const transports = {}

async function handleMcp(key, req, res, body) {
  const tools = MCP_TOOLS[key]
  if (!tools) {
    res.writeHead(404).end()
    return
  }
  const sessionId = req.headers['mcp-session-id']
  let transport = typeof sessionId === 'string' ? transports[sessionId] : undefined
  if (!transport) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        transports[id] = transport
      },
    })
    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId]
    }
    await buildMcpServer(key, tools).connect(transport)
  }
  await transport.handleRequest(req, res, body)
}

createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => {
    raw += c
  })
  req.on('end', async () => {
    const mcp = req.url?.match(/^\/mcp\/([^/?]+)/)
    if (mcp) {
      let body
      try {
        body = raw ? JSON.parse(raw) : undefined
      } catch {}
      await handleMcp(mcp[1], req, res, body)
      return
    }

    // Echo any per-run overrides back into the answer so the e2e can assert they arrived.
    let data = {}
    try {
      data = JSON.parse(raw)
    } catch {}
    const parts = ['fake agent answer']
    if (typeof data.instructions === 'string' && data.instructions) parts.push(`sys=${data.instructions}`)
    if (data.temperature != null) parts.push(`temp=${data.temperature}`)
    if (Array.isArray(data.tools) && data.tools.length) parts.push(`tools=${data.tools.map((t) => t.name).join(',')}`)
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        output_text: parts.join(' · '),
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      }),
    )
  })
}).listen(port)
