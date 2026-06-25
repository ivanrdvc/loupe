import { describe, expect, it } from 'vitest'
import { buildInspectorView } from '#/features/inspect/logic'
import type { Span } from '#/lib/spans'
import { buildRows } from './tree'

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

const rowIds = (spans: Span[], rawRoots = new Set<string>()) =>
  buildRows(buildInspectorView(spans), new Set(), rawRoots).map((r) => r.span.id)

describe('buildRows — collapsible-infra promotion', () => {
  it('keeps the root of an all-HTTP trace and reveals its children under raw', () => {
    const spans = [
      span({ id: 'h1', operation: 'http', traceId: 'T', parentId: null }),
      span({ id: 'h2', operation: 'http', traceId: 'T', parentId: 'h1' }),
    ]
    expect(rowIds(spans)).toEqual(['h1'])
    expect(rowIds(spans, new Set(['h1']))).toEqual(['h1', 'h2'])
  })

  it('promotes real children over an infra root (no noisy transport row)', () => {
    const spans = [
      span({ id: 'post', operation: 'http', traceId: 'T2', parentId: null }),
      span({ id: 'agent', operation: 'invoke_agent', traceId: 'T2', parentId: 'post' }),
      span({ id: 'chat', operation: 'chat', traceId: 'T2', parentId: 'agent' }),
    ]
    const ids = rowIds(spans)
    expect(ids).not.toContain('post')
    expect(ids).toContain('agent')
  })

  it('collapses a successful stray top-level infra span in a trace that has real content', () => {
    const spans = [
      span({ id: 'agent', operation: 'invoke_agent', traceId: 'T3', parentId: null }),
      span({ id: 'chat', operation: 'chat', traceId: 'T3', parentId: 'agent' }),
      span({ id: 'stray', operation: 'http', traceId: 'T3', parentId: null }),
    ]
    expect(rowIds(spans)).not.toContain('stray')
  })

  it('keeps an errored unclassified span even inside a classified trace (error is signal)', () => {
    const spans = [
      span({ id: 'agent', operation: 'invoke_agent', traceId: 'T4', parentId: null }),
      span({ id: 'chat', operation: 'chat', traceId: 'T4', parentId: 'agent' }),
      span({ id: 'cosmos404', operation: 'http', traceId: 'T4', parentId: null, hasError: true, errorType: '404' }),
    ]
    expect(rowIds(spans)).toContain('cosmos404')
  })
})
