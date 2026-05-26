import { describe, expect, it } from 'vitest'
import { normalizeRunGraph, propagateInheritedAttrs, type Span } from './spans'

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

describe('propagateInheritedAttrs', () => {
  it('inherits operationName and agUiRunId from the nearest ancestor', () => {
    const spans: Span[] = [
      span({ id: 'root', operation: 'invoke_agent', operationName: 'title_generation', agUiRunId: 'run-1' }),
      span({ id: 'mid', operation: 'invoke_agent', parentId: 'root' }),
      span({ id: 'leaf', operation: 'chat', parentId: 'mid' }),
    ]
    propagateInheritedAttrs(spans)
    expect(spans[1]).toMatchObject({ operationName: 'title_generation', agUiRunId: 'run-1' })
    expect(spans[2]).toMatchObject({ operationName: 'title_generation', agUiRunId: 'run-1' })
  })

  it('does not overwrite values already set on the span', () => {
    const spans: Span[] = [
      span({ id: 'root', operation: 'invoke_agent', operationName: 'summarization', agUiRunId: 'run-x' }),
      span({ id: 'leaf', operation: 'chat', parentId: 'root', operationName: 'title_generation', agUiRunId: 'run-y' }),
    ]
    propagateInheritedAttrs(spans)
    expect(spans[1]).toMatchObject({ operationName: 'title_generation', agUiRunId: 'run-y' })
  })

  it('handles spans appearing before their parent in the input array', () => {
    const spans: Span[] = [
      span({ id: 'leaf', operation: 'chat', parentId: 'root' }),
      span({ id: 'root', operation: 'invoke_agent', operationName: 'title_generation' }),
    ]
    propagateInheritedAttrs(spans)
    expect(spans[0].operationName).toBe('title_generation')
  })

  it('leaves a span untouched when no ancestor carries the attr', () => {
    const spans: Span[] = [
      span({ id: 'root', operation: 'invoke_agent' }),
      span({ id: 'leaf', operation: 'chat', parentId: 'root' }),
    ]
    propagateInheritedAttrs(spans)
    expect(spans[1].operationName).toBeUndefined()
    expect(spans[1].agUiRunId).toBeUndefined()
  })
})

// Orchestrator detection collapses to `!s.taskParentId` after normalizeRunGraph,
// so these tests pin the topology invariants the old turns.test.ts covered.
function orchestratorIds(spans: Span[]): string[] {
  normalizeRunGraph(spans)
  return spans
    .filter((s) => s.operation === 'invoke_agent' && !s.taskParentId)
    .sort((a, b) => a.startMs - b.startMs)
    .map((s) => s.id)
}

describe('normalizeRunGraph + orchestrator filter', () => {
  it('excludes nested invoke_agent runs (direct parent is an agent)', () => {
    const spans = [
      span({ id: 'root', operation: 'http', endMs: 200 }),
      span({ id: 'orch', operation: 'invoke_agent', parentId: 'root', startMs: 10 }),
      span({ id: 'sub', operation: 'invoke_agent', parentId: 'orch', startMs: 20 }),
    ]
    expect(orchestratorIds(spans)).toEqual(['orch'])
  })

  it('returns sibling top-level invoke_agents in one trace (.NET re-invoke per step)', () => {
    const spans = [
      span({ id: 'root', operation: 'http', endMs: 500 }),
      span({ id: 'orchA', operation: 'invoke_agent', parentId: 'root', startMs: 10 }),
      span({ id: 'chatA', operation: 'chat', parentId: 'orchA', startMs: 20 }),
      span({ id: 'orchB', operation: 'invoke_agent', parentId: 'root', startMs: 100 }),
      span({ id: 'chatB', operation: 'chat', parentId: 'orchB', startMs: 110 }),
    ]
    expect(orchestratorIds(spans)).toEqual(['orchA', 'orchB'])
  })

  it('excludes invoke_agents wrapped by execute_tool (agent-as-tool)', () => {
    const spans = [
      span({ id: 'orch', operation: 'invoke_agent', startMs: 0, endMs: 500 }),
      span({ id: 'tool', operation: 'tool', parentId: 'orch', startMs: 10 }),
      span({ id: 'sub', operation: 'invoke_agent', parentId: 'tool', startMs: 15 }),
      span({ id: 'subChat', operation: 'chat', parentId: 'sub', startMs: 20 }),
    ]
    expect(orchestratorIds(spans)).toEqual(['orch'])
  })

  it('treats dangling-parent invoke_agents as orchestrators', () => {
    const spans = [span({ id: 'orch', operation: 'invoke_agent', parentId: null, startMs: 10 })]
    expect(orchestratorIds(spans)).toEqual(['orch'])
  })

  it('returns empty when no invoke_agent spans exist', () => {
    const spans = [span({ id: 'a', operation: 'chat' })]
    expect(orchestratorIds(spans)).toEqual([])
  })

  it('trusts producer-emitted taskParentId over span-tree shape', () => {
    // `sub` looks like a top-level invoke_agent by shape (parent is http) but
    // claims another agent's id as its parent — must still bucket as subagent.
    const spans = [
      span({ id: 'root', operation: 'http' }),
      span({ id: 'orch', operation: 'invoke_agent', parentId: 'root', startMs: 10, taskId: 'orch' }),
      span({ id: 'sub', operation: 'invoke_agent', parentId: 'root', startMs: 20, taskParentId: 'orch' }),
    ]
    expect(orchestratorIds(spans)).toEqual(['orch'])
  })

  it('stamps taskId on every invoke_agent', () => {
    const spans = [
      span({ id: 'orch', operation: 'invoke_agent', startMs: 0 }),
      span({ id: 'sub', operation: 'invoke_agent', parentId: 'orch', startMs: 10 }),
    ]
    normalizeRunGraph(spans)
    expect(spans[0].taskId).toBe('orch')
    expect(spans[1].taskId).toBe('sub')
    expect(spans[1].taskParentId).toBe('orch')
  })
})
