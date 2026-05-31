import { describe, expect, it } from 'vitest'
import type { Span } from '#/lib/spans'
import { spanEvalSnapshot } from './span-eval-snapshot'

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
          systemInstructions: 'Be concise.',
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
      systemInstructions: 'Be concise.',
      toolDefinitions: [{ name: 'search' }],
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
    expect(
      spanEvalSnapshot(span({ id: 's1', llmInput: 'x', model: 'gpt-4o', tokens: 42, costUsd: 0.01 })),
    ).toEqual({ llmInput: 'x' })
  })
})
