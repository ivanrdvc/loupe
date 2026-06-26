import { describe, expect, it } from 'vitest'
import type { Span } from '#/lib/spans'
import { collectFrontendTools, resolveToolCalls } from './tools'

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

describe('collectFrontendTools', () => {
  const toolDef = (name: string) => ({ type: 'function', name, description: `${name} desc` })
  const call = (name: string) => ({ role: 'assistant', parts: [{ type: 'tool_call', id: `c-${name}`, name }] })

  // A chat that defines two tools and calls both; only `client_pick` runs frontend-side.
  const chat = (agUiRunId?: string): Span =>
    ({
      id: 'chat',
      operation: 'chat',
      agUiRunId,
      toolDefinitions: [toolDef('backend_fetch'), toolDef('client_pick'), toolDef('unused')],
      llmOutput: [call('backend_fetch'), call('client_pick')],
    }) as unknown as Span

  const backendSpan = (): Span => ({ id: 'x', operation: 'tool', toolName: 'backend_fetch' }) as unknown as Span

  it('lists a called tool with no backend span, not merely-defined ones', () => {
    const tools = collectFrontendTools([chat('run-1'), backendSpan()])
    expect(tools.map((t) => t.name)).toEqual(['client_pick'])
  })

  it('returns nothing outside an AG-UI run', () => {
    expect(collectFrontendTools([chat(undefined), backendSpan()])).toEqual([])
  })
})
