import type { McpLintFinding, McpServer, McpTool } from './types'

const TOOL_COUNT_WARN = 30
const TOOL_COUNT_ERROR = 50
const NAME_MIN = 3
const NAME_MAX = 40
const DESCRIPTION_MIN = 20
const DESCRIPTION_MAX = 500
const NAMESPACE_MIN_TOOLS = 5

// Names too generic to tell an agent what they reference — Anthropic recommends user_id over user.
const AMBIGUOUS_PARAMS = new Set([
  'user',
  'id',
  'name',
  'data',
  'item',
  'object',
  'value',
  'target',
  'resource',
  'entity',
])

export function lintMcpRegistry(servers: McpServer[]): McpLintFinding[] {
  return [
    ...servers.flatMap((server) => [...lintServer(server), ...server.tools.flatMap((tool) => lintTool(server, tool))]),
    ...lintCrossServer(servers),
  ]
}

function lintServer(server: McpServer): McpLintFinding[] {
  const findings: McpLintFinding[] = []

  if (server.fetchStatus === 'error') {
    findings.push({
      severity: 'error',
      category: 'server-health',
      ruleId: 'server.fetch_failed',
      message: `Could not fetch tools from "${server.name}": ${server.fetchError ?? 'unknown error'}. Check the endpoint and transport.`,
      serverId: server.id,
      serverName: server.name,
    })
  }

  const count = server.tools.length
  if (count > TOOL_COUNT_WARN) {
    const over = count > TOOL_COUNT_ERROR
    findings.push({
      severity: over ? 'error' : 'warning',
      category: 'server-health',
      ruleId: 'server.tool_count',
      message: over
        ? `"${server.name}" exposes ${count} tools, over the hard cap of ${TOOL_COUNT_ERROR}. Split it into focused servers — every tool inflates agent context.`
        : `"${server.name}" exposes ${count} tools (recommended max ${TOOL_COUNT_WARN}). Consider splitting it into focused servers.`,
      serverId: server.id,
      serverName: server.name,
      evidence: { count, warning: TOOL_COUNT_WARN, error: TOOL_COUNT_ERROR },
    })
  }

  const cases = namingCases(server.tools)
  if (cases.snake.length > 0 && cases.camel.length > 0) {
    findings.push({
      severity: 'warning',
      category: 'naming',
      ruleId: 'server.naming.mixed_case',
      message: `"${server.name}" mixes snake_case (e.g. ${cases.snake[0]}) and camelCase (e.g. ${cases.camel[0]}) tool names. Pick one convention.`,
      serverId: server.id,
      serverName: server.name,
      evidence: { snake: cases.snake, camel: cases.camel },
    })
  }

  const ns = namespaceCoverage(server.tools)
  if (ns) {
    findings.push({
      severity: 'warning',
      category: 'naming',
      ruleId: 'server.naming.no_prefix',
      message: `"${server.name}" exposes ${server.tools.length} tools with no shared service prefix. Namespace them by service (e.g. "${prefix(server.name)}_search") so an agent holding many tools can disambiguate.`,
      serverId: server.id,
      serverName: server.name,
      evidence: { dominantPrefix: ns.dominant, share: ns.share },
    })
  }

  return findings
}

function lintTool(server: McpServer, tool: McpTool): McpLintFinding[] {
  const findings: McpLintFinding[] = []
  const ref = { serverId: server.id, serverName: server.name, toolId: tool.id, toolName: tool.name }

  const shapeIssue = nameShapeIssue(tool.name)
  if (shapeIssue) {
    findings.push({
      severity: 'warning',
      category: 'naming',
      ruleId: 'tool.name.shape',
      message: `Rename tool "${tool.name}" on "${server.name}" — ${shapeIssue}.`,
      ...ref,
    })
  }

  const description = tool.description?.trim() ?? ''
  if (description.length === 0) {
    findings.push({
      severity: 'error',
      category: 'tool-catalog',
      ruleId: 'tool.description.missing',
      message: `Add a description to tool "${tool.name}" on "${server.name}" — agents pick tools from the description.`,
      ...ref,
    })
  } else if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
    const tooShort = description.length < DESCRIPTION_MIN
    findings.push({
      severity: 'warning',
      category: 'tool-catalog',
      ruleId: 'tool.description.length',
      message: tooShort
        ? `Tool "${tool.name}" has a ${description.length}-char description (aim for ${DESCRIPTION_MIN}–${DESCRIPTION_MAX}). Add detail on what it does and when to use it.`
        : `Tool "${tool.name}" has a ${description.length}-char description (over ${DESCRIPTION_MAX}). Trim it — long descriptions waste agent context.`,
      ...ref,
      evidence: { length: description.length, minimum: DESCRIPTION_MIN, maximum: DESCRIPTION_MAX },
    })
  }

  if (isEmptySchema(tool.inputSchema)) {
    findings.push({
      severity: 'warning',
      category: 'tool-catalog',
      ruleId: 'tool.schema.empty',
      message: `Tool "${tool.name}" on "${server.name}" has no input schema. Declare its parameters so agents call it correctly.`,
      ...ref,
    })
  } else {
    const params = schemaProperties(tool.inputSchema)

    const undocumented = params.filter((p) => !p.hasDescription).map((p) => p.name)
    if (undocumented.length > 0) {
      findings.push({
        severity: 'warning',
        category: 'tool-catalog',
        ruleId: 'tool.param.description_missing',
        message: `Tool "${tool.name}" on "${server.name}" has undocumented parameter${undocumented.length > 1 ? 's' : ''} (${undocumented.join(', ')}). Describe each so agents pass the right values.`,
        ...ref,
        evidence: { parameters: undocumented },
      })
    }

    const ambiguous = params.map((p) => p.name).filter((n) => AMBIGUOUS_PARAMS.has(n.toLowerCase()))
    if (ambiguous.length > 0) {
      findings.push({
        severity: 'warning',
        category: 'naming',
        ruleId: 'tool.param.ambiguous_name',
        message: `Tool "${tool.name}" on "${server.name}" has ambiguous parameter${ambiguous.length > 1 ? 's' : ''} (${ambiguous.join(', ')}). Prefer specific names like "user_id" over "user".`,
        ...ref,
        evidence: { parameters: ambiguous },
      })
    }
  }

  return findings
}

function lintCrossServer(servers: McpServer[]): McpLintFinding[] {
  const byName = new Map<string, McpServer[]>()
  for (const server of servers) {
    for (const tool of server.tools) {
      const owners = byName.get(tool.name) ?? []
      if (!owners.includes(server)) owners.push(server)
      byName.set(tool.name, owners)
    }
  }

  const findings: McpLintFinding[] = []
  for (const [name, owners] of byName) {
    if (owners.length < 2) continue
    const names = owners.map((s) => s.name)
    findings.push({
      severity: 'error',
      category: 'naming',
      ruleId: 'cross_server.duplicate_tool_name',
      message: `Tool name "${name}" is exposed by ${owners.length} servers (${names.join(', ')}). Namespace them (e.g. "${prefix(owners[0].name)}_${name}") so an agent given both can tell them apart.`,
      serverId: owners[0].id,
      serverName: owners[0].name,
      toolName: name,
      evidence: { servers: owners.map((s) => s.id) },
    })
  }
  return findings
}

function nameShapeIssue(name: string): string | null {
  if (/\s/.test(name)) return 'it contains whitespace'
  if (name.length < NAME_MIN) return `it is ${name.length} chars (minimum ${NAME_MIN})`
  if (name.length > NAME_MAX) return `it is ${name.length} chars (maximum ${NAME_MAX})`
  return null
}

function namingCases(tools: McpTool[]): { snake: string[]; camel: string[] } {
  const snake: string[] = []
  const camel: string[] = []
  for (const { name } of tools) {
    if (name.includes('_')) snake.push(name)
    else if (/[a-z][A-Z]/.test(name)) camel.push(name)
  }
  return { snake, camel }
}

function prefix(serverName: string): string {
  return (
    serverName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'server'
  )
}

function schemaProperties(schema: unknown): { name: string; hasDescription: boolean }[] {
  if (!schema || typeof schema !== 'object' || !('properties' in schema)) return []
  const props = (schema as { properties?: unknown }).properties
  if (!props || typeof props !== 'object') return []
  return Object.entries(props as Record<string, unknown>).map(([name, def]) => {
    const desc = def && typeof def === 'object' ? (def as { description?: unknown }).description : undefined
    return { name, hasDescription: typeof desc === 'string' && desc.trim().length > 0 }
  })
}

function namespaceCoverage(tools: McpTool[]): { dominant: string; share: number } | null {
  if (tools.length < NAMESPACE_MIN_TOOLS) return null
  const counts = new Map<string, number>()
  for (const { name } of tools) {
    const [seg, ...rest] = name.split(/[_-]/)
    if (rest.length === 0 || !seg) continue
    counts.set(seg, (counts.get(seg) ?? 0) + 1)
  }
  let dominant = ''
  let best = 0
  for (const [seg, c] of counts) {
    if (c > best) {
      best = c
      dominant = seg
    }
  }
  const share = best / tools.length
  return share >= 0.5 ? null : { dominant, share }
}

function isEmptySchema(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return true
  if ('properties' in schema && schema.properties && typeof schema.properties === 'object') {
    return Object.keys(schema.properties).length === 0
  }
  return Object.keys(schema).length === 0
}
