import { describe, expect, it } from 'vitest'
import type { Span } from '#/lib/spans'
import { collectFrontendTools, collectToolGroups } from './context'

function span(overrides: Partial<Span> & Pick<Span, 'id' | 'operation'>): Span {
  return {
    traceId: 't1',
    parentId: null,
    service: 'svc',
    kind: 'internal',
    name: overrides.operation,
    startMs: 0,
    endMs: 100,
    ...overrides,
  }
}

function chatWithToolCalls(id: string, calls: string[], defs: string[] = calls): Span {
  return span({
    id,
    operation: 'chat',
    parentId: 'orch',
    llmOutput: [{ role: 'assistant', parts: calls.map((name) => ({ type: 'tool_call', id: `call-${name}`, name })) }],
    toolDefinitions: defs.map((name) => ({ type: 'function', name, description: `${name} desc`, parameters: {} })),
  })
}

describe('collectFrontendTools', () => {
  // Heuristic: (LLM called the tool) ∧ ¬(execute_tool span ran it).
  // Gated on at least one execute_tool span existing — see the topology doc.

  it('flags a tool the LLM called but no execute_tool span ran', () => {
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent' }),
      chatWithToolCalls('chat', ['setThemeColor', 'get_proverbs']),
      span({ id: 'exec', operation: 'tool', parentId: 'orch', toolName: 'get_proverbs' }),
    ]
    const frontend = collectFrontendTools(spans)
    expect(frontend.map((t) => t.name)).toEqual(['setThemeColor'])
  })

  it('returns nothing when the session has zero execute_tool spans', () => {
    // The .NET runtime case — every called tool would otherwise be misflagged.
    // Without ANY execute_tool span, we have no evidence backend instrumentation
    // is alive, so we'd rather classify nothing than mislabel everything.
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent' }),
      chatWithToolCalls('chat', ['setThemeColor', 'get_proverbs']),
    ]
    expect(collectFrontendTools(spans)).toEqual([])
  })

  it('does not flag tools that were never called this session', () => {
    // setThemeColor is defined but never tool_called; nothing classifies it.
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent' }),
      chatWithToolCalls('chat', ['get_proverbs'], ['get_proverbs', 'setThemeColor']),
      span({ id: 'exec', operation: 'tool', parentId: 'orch', toolName: 'get_proverbs' }),
    ]
    expect(collectFrontendTools(spans)).toEqual([])
  })
})

describe('collectToolGroups', () => {
  // Frontend pinning, kind discriminator, magic-string immunity.

  it('pins the frontend group first regardless of token weight', () => {
    const spans: Span[] = [chatWithToolCalls('chat', [], ['setThemeColor', 'list_employees', 'generate_report'])]
    const frontendNames = new Set(['setThemeColor'])
    const groups = collectToolGroups(spans, frontendNames)
    expect(groups.map((g) => g.kind)).toEqual(['frontend', 'default'])
    expect(groups[0]?.domain).toBe('frontend')
  })

  it('separates a real server literally named "frontend" from the pinned frontend group', () => {
    // The magic-string-comparison bug — pre-kind, an MCP server named
    // "frontend" would have merged into the pinned section.
    const spans: Span[] = [
      span({
        id: 'chat',
        operation: 'chat',
        toolDefinitions: [
          { type: 'function', name: 'real_frontend_tool', description: 'd', server: 'frontend' },
          { type: 'function', name: 'setThemeColor', description: 'd' },
        ],
      }),
    ]
    const groups = collectToolGroups(spans, new Set(['setThemeColor']))
    const kinds = groups.map((g) => `${g.kind}:${g.domain}`)
    // Both have domain string "frontend", but different kinds keep them apart.
    expect(kinds).toContain('frontend:frontend')
    expect(kinds).toContain('server:frontend')
    expect(kinds[0]).toBe('frontend:frontend') // pinned first
  })

  it('uses kind=server when the tool def carries an explicit server/namespace', () => {
    const spans: Span[] = [
      span({
        id: 'chat',
        operation: 'chat',
        toolDefinitions: [
          { type: 'function', name: 't1', description: 'd', server: 'reporting' },
          { type: 'function', name: 't2', description: 'd', mcp_server: 'employee' },
          { type: 'function', name: 't3', description: 'd' },
        ],
      }),
    ]
    const groups = collectToolGroups(spans)
    const byKind = Object.fromEntries(groups.map((g) => [`${g.kind}:${g.domain}`, g.tools.map((t) => t.name)]))
    expect(byKind['server:reporting']).toEqual(['t1'])
    expect(byKind['server:employee']).toEqual(['t2'])
    expect(byKind['default:tools']).toEqual(['t3'])
  })
})
