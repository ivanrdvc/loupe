import { describe, expect, it } from 'vitest'
import type { Span } from '.'
import { asMessages, findUtilityChatIds } from './conversation'

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

describe('findUtilityChatIds', () => {
  it('flags chat spans with an explicit operationName', () => {
    const spans: Span[] = [
      span({ id: 'a', operation: 'chat', operationName: 'title_generation' }),
      span({ id: 'b', operation: 'chat' }),
    ]
    expect(findUtilityChatIds(spans)).toEqual(new Set(['a']))
  })

  it('flags AG-UI-trace chats missing an agUiRunId as utility', () => {
    const spans: Span[] = [
      span({ id: 'conv', operation: 'chat', agUiRunId: 'run-1' }),
      span({ id: 'util', operation: 'chat' }),
    ]
    expect(findUtilityChatIds(spans)).toEqual(new Set(['util']))
  })

  it('does not flag missing-runId chats when the trace has no AG-UI spans', () => {
    const spans: Span[] = [span({ id: 'chat1', operation: 'chat' }), span({ id: 'chat2', operation: 'chat' })]
    expect(findUtilityChatIds(spans)).toEqual(new Set())
  })

  it('ignores non-chat operations', () => {
    const spans: Span[] = [
      span({ id: 'tool', operation: 'tool', operationName: 'title_generation' }),
      span({ id: 'chat', operation: 'chat', operationName: 'summarization' }),
    ]
    expect(findUtilityChatIds(spans)).toEqual(new Set(['chat']))
  })
})

describe('asMessages — content format support', () => {
  it('parses Logfire { role, parts: [...] } format', () => {
    const out = asMessages([
      { role: 'user', parts: [{ type: 'text', content: 'hi' }] },
      { role: 'assistant', parts: [{ type: 'text', content: 'hello' }] },
    ])
    expect(out).toEqual([
      { role: 'user', parts: [{ kind: 'text', content: 'hi' }] },
      { role: 'assistant', parts: [{ kind: 'text', content: 'hello' }] },
    ])
  })

  it('parses OpenAI plain-string content: { role, content: "..." }', () => {
    const out = asMessages([{ role: 'user', content: 'hello world' }])
    expect(out).toEqual([{ role: 'user', parts: [{ kind: 'text', content: 'hello world' }] }])
  })

  it('parses OpenAI structured content: { role, content: [{ type:"text", text:"..." }] }', () => {
    const out = asMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'first' },
          { type: 'text', text: 'second' },
        ],
      },
    ])
    expect(out).toEqual([
      {
        role: 'user',
        parts: [
          { kind: 'text', content: 'first' },
          { kind: 'text', content: 'second' },
        ],
      },
    ])
  })

  it('prefers parts over content when both are present (Logfire wins)', () => {
    const out = asMessages([
      {
        role: 'user',
        parts: [{ type: 'text', content: 'from parts' }],
        content: 'from content',
      },
    ])
    expect(out[0].parts).toEqual([{ kind: 'text', content: 'from parts' }])
  })

  it('drops messages where neither parts nor content yields anything', () => {
    expect(asMessages([{ role: 'user' }])).toEqual([])
    expect(asMessages([{ role: 'user', content: '' }])).toEqual([])
    expect(asMessages([{ role: 'user', content: [{ type: 'image' }] }])).toEqual([])
  })

  it('skips unknown roles (tool, function, etc.)', () => {
    const out = asMessages([
      { role: 'tool', content: 'tool result text' },
      { role: 'user', content: 'real' },
    ])
    expect(out).toEqual([{ role: 'user', parts: [{ kind: 'text', content: 'real' }] }])
  })
})
