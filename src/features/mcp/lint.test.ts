import { describe, expect, it } from 'vitest'
import { lintMcpRegistry } from './lint'
import type { McpServer, McpTool } from './types'

function tool(serverId: string, name: string, p: Partial<McpTool> = {}): McpTool {
  return {
    id: `${serverId}:${name}`,
    serverId,
    serverName: serverId,
    name,
    description: 'A perfectly reasonable description of the tool.',
    inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
    ...p,
  }
}

function server(id: string, p: Partial<McpServer> = {}): McpServer {
  return {
    id,
    name: id,
    transport: 'streamable-http',
    source: 'test',
    ownerTeam: 'team',
    tools: [],
    fetchStatus: 'ok',
    fetchedAt: 0,
    ...p,
  }
}

function rules(servers: McpServer[]): string[] {
  return lintMcpRegistry(servers).map((f) => f.ruleId)
}

describe('lintMcpRegistry', () => {
  it('flags missing, empty-schema and badly-shaped tools', () => {
    const s = server('s', {
      tools: [tool('s', 'rm', { description: '', inputSchema: undefined }), tool('s', 'get user', {})],
    })
    const found = rules([s])
    expect(found).toContain('tool.description.missing')
    expect(found).toContain('tool.schema.empty')
    expect(found.filter((r) => r === 'tool.name.shape')).toHaveLength(2)
  })

  it('flags mixed snake_case / camelCase within a server', () => {
    const s = server('s', { tools: [tool('s', 'create_note'), tool('s', 'listNotes')] })
    expect(rules([s])).toContain('server.naming.mixed_case')
  })

  it('flags a tool name duplicated across servers as an error', () => {
    const findings = lintMcpRegistry([
      server('a', { tools: [tool('a', 'search')] }),
      server('b', { tools: [tool('b', 'search')] }),
    ])
    const dup = findings.find((f) => f.ruleId === 'cross_server.duplicate_tool_name')
    expect(dup?.severity).toBe('error')
  })

  it('escalates tool-count from warning to error past the hard cap', () => {
    const warn = lintMcpRegistry([server('s', { tools: range(35).map((i) => tool('s', `t${i}`)) })])
    expect(warn.find((f) => f.ruleId === 'server.tool_count')?.severity).toBe('warning')
    const err = lintMcpRegistry([server('s', { tools: range(60).map((i) => tool('s', `t${i}`)) })])
    expect(err.find((f) => f.ruleId === 'server.tool_count')?.severity).toBe('error')
  })

  it('flags undocumented and ambiguous parameters', () => {
    const s = server('s', {
      tools: [
        tool('s', 'fetch_user', {
          inputSchema: { type: 'object', properties: { user: { type: 'string' }, limit: { type: 'number' } } },
        }),
      ],
    })
    const found = rules([s])
    expect(found).toContain('tool.param.description_missing')
    expect(found).toContain('tool.param.ambiguous_name')
  })

  it('does not flag documented, specific parameters', () => {
    const s = server('s', {
      tools: [
        tool('s', 'fetch_user', {
          inputSchema: { type: 'object', properties: { user_id: { type: 'string', description: 'The user id.' } } },
        }),
      ],
    })
    const found = rules([s])
    expect(found).not.toContain('tool.param.description_missing')
    expect(found).not.toContain('tool.param.ambiguous_name')
  })

  it('flags a server whose tools share no service prefix', () => {
    const s = server('s', {
      tools: ['search', 'create', 'delete', 'update', 'list'].map((n) => tool('s', n)),
    })
    expect(rules([s])).toContain('server.naming.no_prefix')
  })

  it('does not flag namespaced tools', () => {
    const s = server('s', {
      tools: ['asana_search', 'asana_create', 'asana_delete', 'asana_update', 'asana_list'].map((n) => tool('s', n)),
    })
    expect(rules([s])).not.toContain('server.naming.no_prefix')
  })

  it('flags a failed fetch', () => {
    expect(rules([server('s', { fetchStatus: 'error', fetchError: 'HTTP 502' })])).toContain('server.fetch_failed')
  })

  it('gives every finding a category', () => {
    const findings = lintMcpRegistry([
      server('a', { ownerTeam: undefined, tools: [tool('a', 'rm', { description: '' }), tool('a', 'search')] }),
      server('b', { tools: [tool('b', 'search')] }),
    ])
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.every((f) => typeof f.category === 'string')).toBe(true)
  })

  it('flags a list tool with no pagination as an unbounded cost finding', () => {
    const s = server('s', { tools: [tool('s', 'list_employees', { inputSchema: undefined })] })
    const found = lintMcpRegistry([s]).find((f) => f.ruleId === 'tool.unbounded')
    expect(found?.category).toBe('cost')
  })
})

describe('lint config', () => {
  it('disables a rule', () => {
    const s = server('s', { fetchStatus: 'error', fetchError: 'HTTP 502' })
    const config = { rules: { 'server.fetch_failed': { enabled: false } } }
    expect(rules([s])).toContain('server.fetch_failed')
    expect(lintMcpRegistry([s], { config }).map((f) => f.ruleId)).not.toContain('server.fetch_failed')
  })

  it('overrides a rule severity', () => {
    const s = server('s', { fetchStatus: 'error', fetchError: 'HTTP 502' })
    const config = { rules: { 'server.fetch_failed': { severity: 'warning' as const } } }
    expect(lintMcpRegistry([s], { config }).find((f) => f.ruleId === 'server.fetch_failed')?.severity).toBe('warning')
  })

  it('adjusts a threshold via options', () => {
    const s = server('s', { tools: range(3).map((i) => tool('s', `t${i}`)) })
    expect(rules([s])).not.toContain('server.tool_count')
    const config = { rules: { 'server.tool_count': { options: { warn: 2, error: 5 } } } }
    expect(lintMcpRegistry([s], { config }).map((f) => f.ruleId)).toContain('server.tool_count')
  })
})

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}
