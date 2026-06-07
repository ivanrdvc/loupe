import { describe, expect, it } from 'vitest'
import type { Span } from '#/lib/spans'
import { resolveToolCalls } from './tools'

function toolSpan(p: Partial<Span> = {}): Span {
  return {
    id: 't1',
    traceId: 'tr',
    parentId: null,
    service: 's',
    kind: 'internal',
    operation: 'tool',
    name: 'execute_tool x',
    startMs: 0,
    endMs: 0,
    toolName: 'x',
    toolCallId: 'call-1',
    ...p,
  } as Span
}

describe('resolveToolCalls', () => {
  it('carries the tool span so the card can read truncation flags', () => {
    const span = toolSpan({ toolResult: 'clipped…', truncatedAttrs: { toolResult: true } })
    const res = resolveToolCalls([span], new Map()).get('call-1')
    expect(res?.span).toBe(span)
    expect(res?.span.truncatedAttrs?.toolResult).toBe(true)
    expect(res?.success).toBe(true)
  })

  it('marks an errored result while still carrying the span', () => {
    const span = toolSpan({ hasError: true, errorType: 'Boom' })
    const res = resolveToolCalls([span], new Map()).get('call-1')
    expect(res?.success).toBe(false)
    expect(res?.error).toEqual({ kind: 'Boom', message: '' })
    expect(res?.span).toBe(span)
  })
})
