import { describe, expect, it } from 'vitest'
import type { McpServer, McpTool } from '../types'
import { aggregateTools } from './aggregate-tools'

function tool(serverId: string, name: string, p: Partial<McpTool> = {}): McpTool {
  return { id: `${serverId}:${name}`, serverId, serverName: serverId, name, ...p }
}

function server(id: string, tools: McpTool[]): McpServer {
  return { id, name: id, transport: 'streamable-http', source: 'test', tools, fetchStatus: 'ok', fetchedAt: 0 }
}

describe('aggregateTools', () => {
  it('dedupes a tool exposed by two servers into one row listing both providers', () => {
    const tools = aggregateTools([
      server('a', [tool('a', 'search', { description: 'same' })]),
      server('b', [tool('b', 'search', { description: 'same' })]),
    ])
    expect(tools).toHaveLength(1)
    expect(tools[0].providers.map((p) => p.serverId)).toEqual(['a', 'b'])
    expect(tools[0].duplicate).toBe(true)
    expect(tools[0].conflict).toBe(false)
  })

  it('flags a conflict when providers disagree on description', () => {
    const [search] = aggregateTools([
      server('a', [tool('a', 'search', { description: 'weather search' })]),
      server('b', [tool('b', 'search', { description: 'document search' })]),
    ])
    expect(search.conflict).toBe(true)
  })

  it('flags a conflict when providers disagree on input schema', () => {
    const [search] = aggregateTools([
      server('a', [tool('a', 'q', { description: 'x', inputSchema: { type: 'object' } })]),
      server('b', [tool('b', 'q', { description: 'x', inputSchema: { type: 'string' } })]),
    ])
    expect(search.conflict).toBe(true)
  })

  it('marks single-provider tools as neither duplicate nor conflict, sorted by name', () => {
    const tools = aggregateTools([server('a', [tool('a', 'beta'), tool('a', 'alpha')])])
    expect(tools.map((t) => t.name)).toEqual(['alpha', 'beta'])
    expect(tools.every((t) => !t.duplicate && !t.conflict)).toBe(true)
  })
})
