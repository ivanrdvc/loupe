import { describe, expect, it } from 'vitest'
import { normalizeRunGraph, type Span } from '#/lib/spans'
import { buildInspectorView } from './index'
import { turnTotals } from './turns'

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

describe('turnTotals — utility chats are not the turn', () => {
  // A title-gen chat on a cheap model fires last, as a direct child of the run.
  const spans: Span[] = [
    span({ id: 'orch', operation: 'invoke_agent', agentName: 'Orchestrator', startMs: 0, endMs: 100 }),
    span({
      id: 'main',
      operation: 'chat',
      parentId: 'orch',
      model: 'gpt-5',
      startMs: 1,
      endMs: 2,
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 1,
    }),
    span({
      id: 'title',
      operation: 'chat',
      parentId: 'orch',
      model: 'gpt-4.1',
      operationName: 'title_generation',
      startMs: 9,
      endMs: 10,
      inputTokens: 20,
      outputTokens: 4,
      costUsd: 0.01,
    }),
  ]
  normalizeRunGraph(spans)
  const totals = turnTotals(buildInspectorView(spans).turns[0])

  it('reports the agent model, not the late title-gen model', () => {
    expect(totals.model).toBe('gpt-5')
  })

  it('excludes utility spend from the turn totals', () => {
    expect(totals.inputTokens).toBe(100)
    expect(totals.outputTokens).toBe(50)
    expect(totals.costUsd).toBe(1)
  })

  it('falls back to the only chat when every chat is utility', () => {
    const onlyUtil: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent', startMs: 0, endMs: 10 }),
      span({
        id: 'title',
        operation: 'chat',
        parentId: 'orch',
        model: 'gpt-4.1',
        operationName: 'title_generation',
        startMs: 1,
        endMs: 2,
      }),
    ]
    normalizeRunGraph(onlyUtil)
    expect(turnTotals(buildInspectorView(onlyUtil).turns[0]).model).toBe('gpt-4.1')
  })
})
