import { describe, expect, it } from 'vitest'
import type { Span } from '#/lib/spans'
import { spanEvalSnapshot, toolCallsFromSpans } from './span-eval-snapshot'

function span(overrides: Partial<Span> & Pick<Span, 'id'>): Span {
  return {
    traceId: 't1',
    parentId: null,
    service: 'svc',
    kind: 'internal',
    operation: 'chat',
    name: 'chat',
    startMs: 0,
    endMs: 100,
    ...overrides,
  }
}

describe('spanEvalSnapshot', () => {
  it('keeps eval-relevant normalized fields', () => {
    expect(
      spanEvalSnapshot(
        span({
          id: 's1',
          llmInput: [{ role: 'user', content: 'hi' }],
          llmOutput: 'hello',
          toolName: 'search',
          inputParams: '{"q":"x"}',
          toolResult: '{"ok":true}',
          agentName: 'researcher',
          toolDefinitions: [{ name: 'search' }],
        }),
      ),
    ).toEqual({
      llmInput: [{ role: 'user', content: 'hi' }],
      llmOutput: 'hello',
      toolName: 'search',
      inputParams: '{"q":"x"}',
      toolResult: '{"ok":true}',
      agentName: 'researcher',
      toolDefinitions: [{ name: 'search' }],
    })
  })

  it('omits systemInstructions — the eval-time agent owns its system prompt', () => {
    expect(spanEvalSnapshot(span({ id: 's1', llmInput: 'x', systemInstructions: 'Be concise.' }))).toEqual({
      llmInput: 'x',
    })
  })

  it('drops null, undefined, and blank strings', () => {
    expect(
      spanEvalSnapshot(
        span({
          id: 's1',
          llmInput: 'prompt',
          llmOutput: '   ',
          toolName: undefined,
          agentName: undefined,
        }),
      ),
    ).toEqual({ llmInput: 'prompt' })
  })

  it('does not copy unrelated span attrs', () => {
    expect(spanEvalSnapshot(span({ id: 's1', llmInput: 'x', model: 'gpt-4o', tokens: 42, costUsd: 0.01 }))).toEqual({
      llmInput: 'x',
    })
  })
})

describe('toolCallsFromSpans', () => {
  it('extracts execute_tool spans in execution order with parsed args', () => {
    const spans = [
      span({ id: 'chat', operation: 'chat', llmOutput: 'thinking', startMs: 0 }),
      span({
        id: 'add',
        operation: 'tool',
        toolName: 'add',
        inputParams: '{"a":1,"b":2}',
        toolResult: '3',
        startMs: 20,
      }),
      span({
        id: 'mul',
        operation: 'tool',
        toolName: 'multiply',
        inputParams: '{"a":3,"b":4}',
        toolResult: '12',
        startMs: 10,
      }),
    ]
    expect(toolCallsFromSpans(spans)).toEqual([
      { name: 'multiply', args: { a: 3, b: 4 }, result: '12' },
      { name: 'add', args: { a: 1, b: 2 }, result: '3' },
    ])
  })

  it('keeps non-JSON args as the raw string and omits missing args/result', () => {
    const spans = [
      span({ id: 't1', operation: 'tool', toolName: 'search', inputParams: 'weather in SF' }),
      span({ id: 't2', operation: 'tool', toolName: 'noop', inputParams: '   ' }),
    ]
    expect(toolCallsFromSpans(spans)).toEqual([{ name: 'search', args: 'weather in SF' }, { name: 'noop' }])
  })

  it('includes mcp spans (classify-span stamps toolName on tool + mcp)', () => {
    const spans = [
      span({
        id: 'm',
        operation: 'mcp',
        toolName: 'fetch_url',
        inputParams: '{"url":"x"}',
        toolResult: 'ok',
        startMs: 5,
      }),
      span({ id: 't', operation: 'tool', toolName: 'add', inputParams: '{"a":1}', startMs: 10 }),
    ]
    expect(toolCallsFromSpans(spans)).toEqual([
      { name: 'fetch_url', args: { url: 'x' }, result: 'ok' },
      { name: 'add', args: { a: 1 } },
    ])
  })

  it('returns [] when the trace has no tool spans', () => {
    expect(toolCallsFromSpans([span({ id: 'c', operation: 'chat', llmOutput: 'hi' })])).toEqual([])
  })
})
