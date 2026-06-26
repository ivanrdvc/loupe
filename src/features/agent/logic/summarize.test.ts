import { describe, expect, it } from 'vitest'
import type { Span } from '#/lib/spans'
import { lastNDaysWindow, summarize } from './summarize'

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

describe('summarize', () => {
  const spans: Span[] = [
    span({ id: 'root', operation: 'invoke_agent', agentName: 'A', startMs: 0, endMs: 300, model: 'gpt-5-nano' }),
    span({ id: 'fast', operation: 'chat', startMs: 10, endMs: 40, tokens: 100, costUsd: 0.001, model: 'gpt-5-nano' }),
    span({ id: 'tool', operation: 'tool', toolName: 'echo', startMs: 50, endMs: 70 }),
    span({ id: 'bad', operation: 'chat', startMs: 80, endMs: 90, hasError: true, errorMessage: 'boom' }),
  ]

  it('computes trace-level aggregates from spans', () => {
    const s = summarize(spans)
    expect(s.spanCount).toBe(4)
    expect(s.durationMs).toBe(300)
    expect(s.totalTokens).toBe(100)
    expect(s.totalCostUsd).toBeCloseTo(0.001)
    expect(s.errorCount).toBe(1)
    expect(s.agents).toEqual(['A'])
    expect(s.models).toEqual(['gpt-5-nano'])
    expect(s.tools).toEqual([{ name: 'echo', calls: 1 }])
  })

  it('ranks slowest first and surfaces errored spans', () => {
    const s = summarize(spans)
    expect(s.slowest[0]).toMatchObject({ name: 'root', durationMs: 300 })
    expect(s.errors).toEqual([
      { id: 'bad', name: 'bad', tool: undefined, type: undefined, message: 'boom', stack: undefined },
    ])
  })

  it('surfaces exception type and trims long stacks for "why" answers', () => {
    const longStack = `RuntimeError: boom\n${'  at frame\n'.repeat(300)}most recent call last`
    const s = summarize([
      span({
        id: 'x',
        operation: 'tool',
        startMs: 0,
        endMs: 5,
        hasError: true,
        errorType: 'RuntimeError',
        errorMessage: 'boom',
        errorStack: longStack,
      }),
    ])
    expect(s.errors[0]).toMatchObject({ type: 'RuntimeError', message: 'boom' })
    expect(s.errors[0].stack).toContain('RuntimeError: boom')
    expect(s.errors[0].stack).toContain('… [stack trimmed] …')
    expect(s.errors[0].stack).toContain('most recent call last')
    expect(s.errors[0].stack?.length).toBeLessThan(longStack.length)
  })

  it('orders steps by start time and flags errors inline', () => {
    const s = summarize(spans)
    expect(s.steps.map((x) => x.name)).toEqual(['root', 'fast', 'tool', 'bad'])
    expect(s.steps.at(-1)?.error).toBe('boom')
    expect(s.stepsTruncated).toBe(false)
  })

  it('elides zero token/cost totals', () => {
    const s = summarize([span({ id: 'x', operation: 'chat', startMs: 0, endMs: 5 })])
    expect(s.totalTokens).toBeUndefined()
    expect(s.totalCostUsd).toBeUndefined()
  })

  it('builds a microsecond look-back window from a fixed now', () => {
    const { fromUs, toUs } = lastNDaysWindow(7, 1_000_000)
    expect(toUs).toBe(1_000_000_000)
    expect(toUs - fromUs).toBe(7 * 24 * 60 * 60 * 1_000_000)
  })
})
