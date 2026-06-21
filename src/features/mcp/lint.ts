import { deriveSignals } from './logic/signals'
import type { LintRule, LintRuleOptions, McpLintConfig, McpLintFinding, McpServer, McpTool } from './types'

// Names too generic to tell an agent what they reference — Anthropic recommends user_id over user.
const AMBIGUOUS_PARAMS = ['user', 'id', 'name', 'data', 'item', 'object', 'value', 'target', 'resource', 'entity']

export const BUILTIN_RULES: LintRule[] = [
  {
    id: 'server.fetch_failed',
    category: 'server-health',
    defaultOptions: {},
    run: (servers) =>
      servers
        .filter((s) => s.fetchStatus === 'error')
        .map((server) => ({
          severity: 'error',
          category: 'server-health',
          ruleId: 'server.fetch_failed',
          message: `Could not fetch tools from "${server.name}": ${server.fetchError ?? 'unknown error'}. Check the endpoint and transport.`,
          serverId: server.id,
          serverName: server.name,
        })),
  },
  {
    id: 'server.tool_count',
    category: 'server-health',
    defaultOptions: { warn: 30, error: 50 },
    run: (servers, o) => {
      const warn = num(o, 'warn', 30)
      const error = num(o, 'error', 50)
      return servers.flatMap((server) => {
        const count = server.tools.length
        if (count <= warn) return []
        const over = count > error
        return [
          {
            severity: over ? 'error' : 'warning',
            category: 'server-health',
            ruleId: 'server.tool_count',
            message: over
              ? `"${server.name}" exposes ${count} tools, over the hard cap of ${error}. Split it into focused servers — every tool inflates agent context.`
              : `"${server.name}" exposes ${count} tools (recommended max ${warn}). Consider splitting it into focused servers.`,
            serverId: server.id,
            serverName: server.name,
            evidence: { count, warning: warn, error },
          },
        ]
      })
    },
  },
  {
    id: 'server.naming.mixed_case',
    category: 'naming',
    defaultOptions: {},
    run: (servers) =>
      servers.flatMap((server) => {
        const cases = namingCases(server.tools)
        if (cases.snake.length === 0 || cases.camel.length === 0) return []
        return [
          {
            severity: 'warning',
            category: 'naming',
            ruleId: 'server.naming.mixed_case',
            message: `"${server.name}" mixes snake_case (e.g. ${cases.snake[0]}) and camelCase (e.g. ${cases.camel[0]}) tool names. Pick one convention.`,
            serverId: server.id,
            serverName: server.name,
            evidence: { snake: cases.snake, camel: cases.camel },
          },
        ]
      }),
  },
  {
    id: 'server.naming.no_prefix',
    category: 'naming',
    defaultOptions: { minTools: 5, minShare: 0.5 },
    run: (servers, o) => {
      const minTools = num(o, 'minTools', 5)
      const minShare = num(o, 'minShare', 0.5)
      return servers.flatMap((server) => {
        const ns = namespaceCoverage(server.tools, minTools, minShare)
        if (!ns) return []
        return [
          {
            severity: 'warning',
            category: 'naming',
            ruleId: 'server.naming.no_prefix',
            message: `"${server.name}" exposes ${server.tools.length} tools with no shared service prefix. Namespace them by service (e.g. "${prefix(server.name)}_search") so an agent holding many tools can disambiguate.`,
            serverId: server.id,
            serverName: server.name,
            evidence: { dominantPrefix: ns.dominant, share: ns.share },
          },
        ]
      })
    },
  },
  {
    id: 'tool.name.shape',
    category: 'naming',
    defaultOptions: { min: 3, max: 40 },
    run: (servers, o) => {
      const min = num(o, 'min', 3)
      const max = num(o, 'max', 40)
      return eachTool(servers, (server, tool, ref) => {
        const issue = nameShapeIssue(tool.name, min, max)
        return issue
          ? [
              {
                severity: 'warning',
                category: 'naming',
                ruleId: 'tool.name.shape',
                message: `Rename tool "${tool.name}" on "${server.name}" — ${issue}.`,
                ...ref,
              },
            ]
          : []
      })
    },
  },
  {
    id: 'tool.description.missing',
    category: 'tool-catalog',
    defaultOptions: {},
    run: (servers) =>
      eachTool(servers, (server, tool, ref) =>
        (tool.description?.trim() ?? '').length === 0
          ? [
              {
                severity: 'error',
                category: 'tool-catalog',
                ruleId: 'tool.description.missing',
                message: `Add a description to tool "${tool.name}" on "${server.name}" — agents pick tools from the description.`,
                ...ref,
              },
            ]
          : [],
      ),
  },
  {
    id: 'tool.description.length',
    category: 'tool-catalog',
    defaultOptions: { min: 20, max: 500 },
    run: (servers, o) => {
      const min = num(o, 'min', 20)
      const max = num(o, 'max', 500)
      return eachTool(servers, (_server, tool, ref) => {
        const description = tool.description?.trim() ?? ''
        if (description.length === 0 || (description.length >= min && description.length <= max)) return []
        const tooShort = description.length < min
        return [
          {
            severity: 'warning',
            category: 'tool-catalog',
            ruleId: 'tool.description.length',
            message: tooShort
              ? `Tool "${tool.name}" has a ${description.length}-char description (aim for ${min}–${max}). Add detail on what it does and when to use it.`
              : `Tool "${tool.name}" has a ${description.length}-char description (over ${max}). Trim it — long descriptions waste agent context.`,
            ...ref,
            evidence: { length: description.length, minimum: min, maximum: max },
          },
        ]
      })
    },
  },
  {
    id: 'tool.schema.empty',
    category: 'tool-catalog',
    defaultOptions: {},
    run: (servers) =>
      eachTool(servers, (server, tool, ref) =>
        isEmptySchema(tool.inputSchema)
          ? [
              {
                severity: 'warning',
                category: 'tool-catalog',
                ruleId: 'tool.schema.empty',
                message: `Tool "${tool.name}" on "${server.name}" has no input schema. Declare its parameters so agents call it correctly.`,
                ...ref,
              },
            ]
          : [],
      ),
  },
  {
    id: 'tool.param.description_missing',
    category: 'tool-catalog',
    defaultOptions: {},
    run: (servers) =>
      eachTool(servers, (server, tool, ref) => {
        if (isEmptySchema(tool.inputSchema)) return []
        const undocumented = schemaProperties(tool.inputSchema)
          .filter((p) => !p.hasDescription)
          .map((p) => p.name)
        if (undocumented.length === 0) return []
        return [
          {
            severity: 'warning',
            category: 'tool-catalog',
            ruleId: 'tool.param.description_missing',
            message: `Tool "${tool.name}" on "${server.name}" has undocumented parameter${undocumented.length > 1 ? 's' : ''} (${undocumented.join(', ')}). Describe each so agents pass the right values.`,
            ...ref,
            evidence: { parameters: undocumented },
          },
        ]
      }),
  },
  {
    id: 'tool.param.ambiguous_name',
    category: 'naming',
    defaultOptions: { names: AMBIGUOUS_PARAMS },
    run: (servers, o) => {
      const names = new Set(strList(o, 'names', AMBIGUOUS_PARAMS).map((n) => n.toLowerCase()))
      return eachTool(servers, (server, tool, ref) => {
        if (isEmptySchema(tool.inputSchema)) return []
        const ambiguous = schemaProperties(tool.inputSchema)
          .map((p) => p.name)
          .filter((n) => names.has(n.toLowerCase()))
        if (ambiguous.length === 0) return []
        return [
          {
            severity: 'warning',
            category: 'naming',
            ruleId: 'tool.param.ambiguous_name',
            message: `Tool "${tool.name}" on "${server.name}" has ambiguous parameter${ambiguous.length > 1 ? 's' : ''} (${ambiguous.join(', ')}). Prefer specific names like "user_id" over "user".`,
            ...ref,
            evidence: { parameters: ambiguous },
          },
        ]
      })
    },
  },
  {
    // Heuristics live in deriveSignals, so config can only enable/reseverity this.
    id: 'tool.unbounded',
    category: 'cost',
    defaultOptions: {},
    run: (servers) =>
      eachTool(servers, (server, tool, ref) => {
        const signals = deriveSignals(tool)
        if (!signals.includes('unbounded')) return []
        return [
          {
            severity: 'warning',
            category: 'cost',
            ruleId: 'tool.unbounded',
            message: `Tool "${tool.name}" on "${server.name}" returns an unbounded result set — it takes no pagination (cursor/limit) or filter param, so its output grows with your data. Add a limit/cursor to keep agent context bounded as the org scales.`,
            ...ref,
            evidence: { signals },
          },
        ]
      }),
  },
  {
    id: 'cross_server.duplicate_tool_name',
    category: 'naming',
    defaultOptions: {},
    run: (servers) => {
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
        findings.push({
          severity: 'error',
          category: 'naming',
          ruleId: 'cross_server.duplicate_tool_name',
          message: `Tool name "${name}" is exposed by ${owners.length} servers (${owners.map((s) => s.name).join(', ')}). Namespace them (e.g. "${prefix(owners[0].name)}_${name}") so an agent given both can tell them apart.`,
          serverId: owners[0].id,
          serverName: owners[0].name,
          toolName: name,
          evidence: { servers: owners.map((s) => s.id) },
        })
      }
      return findings
    },
  },
]

export function lintMcpRegistry(
  servers: McpServer[],
  opts: { config?: McpLintConfig; rules?: LintRule[] } = {},
): McpLintFinding[] {
  const rules = opts.rules ?? BUILTIN_RULES
  const byId = opts.config?.rules ?? {}
  const out: McpLintFinding[] = []
  for (const rule of rules) {
    const cfg = byId[rule.id]
    if (cfg?.enabled === false) continue
    const options = { ...rule.defaultOptions, ...(cfg?.options ?? {}) }
    for (const finding of rule.run(servers, options)) {
      out.push(cfg?.severity ? { ...finding, severity: cfg.severity } : finding)
    }
  }
  return out
}

type ToolRef = Pick<McpLintFinding, 'serverId' | 'serverName' | 'toolId' | 'toolName'>

function eachTool(
  servers: McpServer[],
  fn: (server: McpServer, tool: McpTool, ref: ToolRef) => McpLintFinding[],
): McpLintFinding[] {
  return servers.flatMap((server) =>
    server.tools.flatMap((tool) =>
      fn(server, tool, { serverId: server.id, serverName: server.name, toolId: tool.id, toolName: tool.name }),
    ),
  )
}

function num(o: LintRuleOptions, key: string, fallback: number): number {
  const v = o[key]
  return typeof v === 'number' ? v : fallback
}

function strList(o: LintRuleOptions, key: string, fallback: string[]): string[] {
  const v = o[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : fallback
}

function nameShapeIssue(name: string, min: number, max: number): string | null {
  if (/\s/.test(name)) return 'it contains whitespace'
  if (name.length < min) return `it is ${name.length} chars (minimum ${min})`
  if (name.length > max) return `it is ${name.length} chars (maximum ${max})`
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

function namespaceCoverage(
  tools: McpTool[],
  minTools: number,
  minShare: number,
): { dominant: string; share: number } | null {
  if (tools.length < minTools) return null
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
  return share >= minShare ? null : { dominant, share }
}

function isEmptySchema(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') return true
  if ('properties' in schema && schema.properties && typeof schema.properties === 'object') {
    return Object.keys(schema.properties).length === 0
  }
  return Object.keys(schema).length === 0
}
