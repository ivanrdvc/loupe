import { describe, expect, it } from 'vitest'
import { normalizeRunGraph, type Span } from '#/lib/spans'
import { buildInspectorView } from './index'

function span(p: Partial<Span> & { id: string; operation: Span['operation'] }): Span {
  return {
    traceId: 't',
    parentId: null,
    service: 's',
    kind: 'internal',
    name: p.id,
    startMs: 0,
    endMs: 0,
    sessionId: 's',
    sessionSource: 'trace',
    ...p,
  } as Span
}

describe('buildInspectorView — orchestrator / sub-agent topology', () => {
  const spans: Span[] = [
    span({ id: 'orch', operation: 'invoke_agent', agentName: 'Orchestrator', startMs: 0, endMs: 100 }),
    span({ id: 'c1', operation: 'chat', parentId: 'orch', startMs: 1, endMs: 2, inputTokens: 10, outputTokens: 5 }),
    span({
      id: 'data',
      operation: 'tool',
      parentId: 'orch',
      toolName: 'lookup',
      toolCallId: 'call_d',
      startMs: 3,
      endMs: 4,
    }),
    span({
      id: 'tcall',
      operation: 'tool',
      parentId: 'orch',
      toolName: 'sub_agent',
      toolCallId: 'call_s',
      startMs: 5,
      endMs: 9,
    }),
    span({ id: 'sub', operation: 'invoke_agent', parentId: 'tcall', agentName: 'SubAgent', startMs: 6, endMs: 8 }),
    span({ id: 'c2', operation: 'chat', parentId: 'sub', startMs: 6, endMs: 7, inputTokens: 4, outputTokens: 2 }),
  ]
  normalizeRunGraph(spans)
  const view = buildInspectorView(spans)

  it('treats only the top-level invoke_agent as an orchestrator', () => {
    expect(view.orchestratorIds).toEqual(['orch'])
  })

  it('nests the sub-agent under its execute_tool in the raw span tree', () => {
    expect(view.childrenByParent.get('tcall')?.map((s) => s.id)).toEqual(['sub'])
    expect(view.childrenByParent.get('orch')?.map((s) => s.id)).toEqual(['c1', 'data', 'tcall'])
  })

  it('builds one turn: data tool + agent-as-tool as actions, sub-agent chat as a sub-chat', () => {
    expect(view.turns).toHaveLength(1)
    const turn = view.turns[0]
    expect(turn.run.id).toBe('orch')
    expect(turn.actions.map((s) => s.id)).toEqual(['data', 'tcall'])
    expect(turn.chats.map((s) => s.id)).toEqual(['c1'])
    expect(turn.subagentChats.map((s) => s.id)).toEqual(['c2'])
  })
})
