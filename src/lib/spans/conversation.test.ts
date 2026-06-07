import { describe, expect, it } from 'vitest'
import type { Span } from '.'
import { asMessages, buildConversation } from './conversation'

function chatSpan(p: Partial<Span> & { id: string; startMs: number }): Span {
  return {
    traceId: 't',
    parentId: null,
    service: 's',
    kind: 'internal',
    operation: 'chat',
    name: 'chat gpt-5',
    endMs: p.startMs,
    ...p,
  } as Span
}

const userMsg = (text: string) => ({ role: 'user', parts: [{ type: 'text', content: text }] })
const sysMsg = (text: string) => ({ role: 'system', parts: [{ type: 'text', content: text }] })
const asstMsg = (text: string) => ({ role: 'assistant', parts: [{ type: 'text', content: text }] })

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

describe('buildConversation — multi-iteration turn collapse', () => {
  const texts = (events: ReturnType<typeof buildConversation>) =>
    events.filter((e) => e.kind === 'message').map((e) => `${e.role}:${e.content}`)

  it('collapses assistant-less iteration spans, emitting system+user once (tanstack shape)', () => {
    // 3 iteration spans under a root, each re-sending cumulative history with
    // no assistant message to anchor the tail — the case that used to duplicate.
    const spans: Span[] = [
      chatSpan({ id: 'root', startMs: 0, endMs: 100, llmInput: [sysMsg('S'), userMsg('hi')] }),
      chatSpan({ id: 'i0', parentId: 'root', startMs: 10, llmInput: [sysMsg('S'), userMsg('hi')] }),
      chatSpan({
        id: 'i1',
        parentId: 'root',
        startMs: 20,
        llmInput: [sysMsg('S'), userMsg('hi'), { role: 'tool', content: 'r' }],
        llmOutput: [asstMsg('done')],
      }),
    ]
    const out = texts(buildConversation(spans))
    // system + user appear exactly once each, despite 3 spans carrying them
    expect(out.filter((t) => t === 'user:hi')).toHaveLength(1)
    expect(out.filter((t) => t === 'system:S')).toHaveLength(1)
    expect(out).toContain('assistant:done')
  })

  it('leaves a single-span turn (MEAI/App Insights) byte-identical', () => {
    const spans: Span[] = [
      chatSpan({
        id: 'a',
        startMs: 0,
        endMs: 50,
        llmInput: [sysMsg('S'), userMsg('q')],
        llmOutput: [asstMsg('a')],
        inputTokens: 5,
        outputTokens: 2,
      }),
    ]
    const out = buildConversation(spans).filter((e) => e.kind === 'message')
    expect(out.map((e) => `${e.role}:${e.content}`)).toEqual(['system:S', 'user:q', 'assistant:a'])
    const assistant = out.find((e) => e.role === 'assistant')
    expect(assistant?.outputTokens).toBe(2) // token attribution preserved
  })

  it('does not group two sibling chat spans that are separate turns', () => {
    // Two independent turns (not parent/child) — each keeps its own messages.
    const spans: Span[] = [
      chatSpan({ id: 't1', startMs: 0, llmInput: [userMsg('first')], llmOutput: [asstMsg('one')] }),
      chatSpan({ id: 't2', startMs: 100, llmInput: [userMsg('second')], llmOutput: [asstMsg('two')] }),
    ]
    const out = texts(buildConversation(spans))
    expect(out).toEqual(['user:first', 'assistant:one', 'user:second', 'assistant:two'])
  })

  it('renders the reply once when a parent generation mirrors the final step', () => {
    // Langfuse shape: the parent and the last step both carry the final text.
    const spans: Span[] = [
      chatSpan({ id: 'root', startMs: 0, endMs: 100, llmInput: [userMsg('hi')], llmOutput: [asstMsg('done')] }),
      chatSpan({ id: 'i0', parentId: 'root', startMs: 10, llmInput: [userMsg('hi')] }),
      chatSpan({
        id: 'i1',
        parentId: 'root',
        startMs: 20,
        endMs: 30,
        llmInput: [userMsg('hi')],
        llmOutput: [asstMsg('done')],
      }),
    ]
    const out = texts(buildConversation(spans))
    expect(out.filter((t) => t === 'assistant:done')).toHaveLength(1)
  })
})

describe('buildConversation — tool_call synthesis', () => {
  function toolSpan(p: Partial<Span> & { id: string; startMs: number }): Span {
    return {
      traceId: 't',
      parentId: null,
      service: 's',
      kind: 'internal',
      operation: 'tool',
      name: 'execute_tool get_time',
      endMs: p.startMs,
      ...p,
    } as Span
  }

  it('synthesizes a tool_call from the execute_tool span when no chat span recorded it', () => {
    // Instrumentation that never emits the assistant tool_call (only the
    // execution span) would otherwise leave the result an orphan.
    const spans: Span[] = [
      chatSpan({ id: 'c', startMs: 0, endMs: 50, llmInput: [userMsg('time?')], llmOutput: [asstMsg('it is noon')] }),
      toolSpan({
        id: 'tool',
        startMs: 10,
        endMs: 12,
        toolName: 'get_time',
        toolCallId: 'call-1',
        inputParams: '{"tz":"UTC"}',
        toolResult: { time: 'noon' },
      }),
    ]
    const out = buildConversation(spans)
    const call = out.find((e) => e.kind === 'tool_call')
    const result = out.find((e) => e.kind === 'tool_result')
    expect(call).toMatchObject({ toolName: 'get_time', callId: 'call-1', arguments: { tz: 'UTC' } })
    expect(result).toMatchObject({ callId: 'call-1', success: true })
  })

  it('does not synthesize when the chat span already supplied the tool_call', () => {
    const spans: Span[] = [
      chatSpan({
        id: 'c',
        startMs: 0,
        endMs: 50,
        llmInput: [userMsg('time?')],
        llmOutput: [
          {
            role: 'assistant',
            parts: [{ type: 'tool_call', id: 'call-1', name: 'get_time', arguments: { tz: 'UTC' } }],
          },
        ],
      }),
      toolSpan({
        id: 'tool',
        startMs: 10,
        endMs: 12,
        toolName: 'get_time',
        toolCallId: 'call-1',
        toolResult: { t: 'noon' },
      }),
    ]
    const calls = buildConversation(spans).filter((e) => e.kind === 'tool_call')
    expect(calls).toHaveLength(1)
  })
})
