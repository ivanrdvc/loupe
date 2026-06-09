import { describe, expect, it } from 'vitest'
import type { Span } from '.'
import { asMessages, buildConversation, toolError, toolResultError } from './conversation'

function toolErrSpan(p: Partial<Span> = {}): Span {
  return {
    id: 'tx',
    traceId: 't',
    parentId: null,
    service: 's',
    kind: 'internal',
    operation: 'tool',
    name: 'execute_tool x',
    startMs: 0,
    endMs: 0,
    ...p,
  } as Span
}

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

  it('keeps the opening prompt when later iterations re-send the prior assistant (ReAct loop)', () => {
    // Each iteration re-sends history incl. the prior assistant, which
    // turnTailStart skips — the opening prompt must still survive.
    const spans: Span[] = [
      chatSpan({ id: 'root', startMs: 0, endMs: 100, llmInput: [sysMsg('S'), userMsg('Q')] }),
      chatSpan({
        id: 'i0',
        parentId: 'root',
        startMs: 10,
        llmInput: [sysMsg('S'), userMsg('Q')],
        llmOutput: [asstMsg('let me check')],
      }),
      chatSpan({
        id: 'i1',
        parentId: 'root',
        startMs: 30,
        llmInput: [sysMsg('S'), userMsg('Q'), asstMsg('let me check'), { role: 'tool', content: 'data' }],
        llmOutput: [asstMsg('FINAL')],
      }),
    ]
    const out = texts(buildConversation(spans))
    expect(out.filter((t) => t === 'system:S')).toHaveLength(1)
    expect(out.filter((t) => t === 'user:Q')).toHaveLength(1)
    expect(out).toEqual(['system:S', 'user:Q', 'assistant:let me check', 'assistant:FINAL'])
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

describe('toolError', () => {
  it('reads a raised tool from span-level error fields (no toolResult)', () => {
    const err = toolError(
      toolErrSpan({
        hasError: true,
        errorType: 'RuntimeError',
        errorMessage: 'simulated failure (p=1.0)',
        errorStack: 'Traceback...',
      }),
    )
    expect(err).toEqual({ kind: 'RuntimeError', message: 'simulated failure (p=1.0)', stack: 'Traceback...' })
  })

  it('falls back to kind=error, empty message when hasError is set but type/message are missing', () => {
    const err = toolError(toolErrSpan({ hasError: true }))
    expect(err).toEqual({ kind: 'error', message: '' })
    expect(err && 'stack' in err).toBe(false)
  })

  it('detects an error-shaped payload when the span has no error status ({ error:true })', () => {
    const err = toolError(toolErrSpan({ toolResult: { error: true, message: 'boom' } }))
    expect(err).toEqual({ kind: 'error', message: 'boom' })
  })

  it('detects { status:"error" } payloads (kind falls through to "error")', () => {
    const err = toolError(toolErrSpan({ toolResult: { status: 'error', message: 'bad' } }))
    expect(err).toEqual({ kind: 'error', message: 'bad' })
  })

  it('detects Anthropic-style { is_error:true }', () => {
    const err = toolError(toolErrSpan({ toolResult: { is_error: true, message: 'tool blew up' } }))
    expect(err).toEqual({ kind: 'error', message: 'tool blew up' })
  })

  it('detects MCP-style { isError:true } with no message', () => {
    const err = toolError(toolErrSpan({ toolResult: { isError: true } }))
    expect(err).toEqual({ kind: 'error', message: '' })
  })

  it('returns undefined on success (no span error, no error-shaped payload)', () => {
    expect(toolError(toolErrSpan())).toBeUndefined()
    expect(toolError(toolErrSpan({ toolResult: { ok: true } }))).toBeUndefined()
    expect(toolError(toolErrSpan({ toolResult: 'plain string' }))).toBeUndefined()
    expect(toolError(toolErrSpan({ toolResult: [1, 2, 3] }))).toBeUndefined()
    expect(toolError(toolErrSpan({ toolResult: null as never }))).toBeUndefined()
  })

  it('prefers span-level error over an error-shaped payload', () => {
    const err = toolError(toolErrSpan({ hasError: true, errorType: 'X', toolResult: { error: true, message: 'y' } }))
    expect(err).toEqual({ kind: 'X', message: '' })
  })

  it('recovers payload detail when the span flags an error but carries no type/message', () => {
    const err = toolError(toolErrSpan({ hasError: true, toolResult: { is_error: true, message: 'real detail' } }))
    expect(err).toEqual({ kind: 'error', message: 'real detail' })
  })
})

describe('toolResultError', () => {
  it('detects each error discriminant set to true', () => {
    expect(toolResultError({ error: true })).toEqual({ kind: 'error', message: '' })
    expect(toolResultError({ status: 'error' })).toEqual({ kind: 'error', message: '' })
    expect(toolResultError({ is_error: true })).toEqual({ kind: 'error', message: '' })
    expect(toolResultError({ isError: true })).toEqual({ kind: 'error', message: '' })
  })

  it('uses a string `error` value as kind', () => {
    expect(toolResultError({ error: true, message: 'm' })).toEqual({ kind: 'error', message: 'm' })
    // A string `error` only drives `kind`; another discriminant must mark the error.
    expect(toolResultError({ error: 'Timeout', status: 'error', message: 'm' })).toEqual({
      kind: 'Timeout',
      message: 'm',
    })
  })

  it('uses a string `status` value as kind when `error` is not a string', () => {
    expect(toolResultError({ status: 'error', message: 'm' })).toEqual({ kind: 'error', message: 'm' })
  })

  it('returns undefined for non-error / null / array / non-object payloads', () => {
    expect(toolResultError({ ok: true })).toBeUndefined()
    expect(toolResultError({ status: 'success' })).toBeUndefined()
    expect(toolResultError(undefined)).toBeUndefined()
    expect(toolResultError(null as never)).toBeUndefined()
    expect(toolResultError([1, 2, 3])).toBeUndefined()
    expect(toolResultError('plain string')).toBeUndefined()
    expect(toolResultError(42)).toBeUndefined()
  })
})

describe('buildConversation — tool_result error surfacing', () => {
  function toolSpan(p: Partial<Span> & { id: string; startMs: number }): Span {
    return {
      traceId: 't',
      parentId: null,
      service: 's',
      kind: 'internal',
      operation: 'tool',
      name: 'execute_tool crash',
      endMs: p.startMs,
      ...p,
    } as Span
  }

  it('emits tool_result with success:false and an error when the execute_tool span raised', () => {
    const spans: Span[] = [
      chatSpan({
        id: 'c',
        startMs: 0,
        endMs: 50,
        llmInput: [userMsg('go')],
        llmOutput: [
          {
            role: 'assistant',
            parts: [{ type: 'tool_call', id: 'call-x', name: 'crash', arguments: {} }],
          },
        ],
      }),
      toolSpan({
        id: 'tool',
        startMs: 10,
        endMs: 12,
        toolName: 'crash',
        toolCallId: 'call-x',
        hasError: true,
        errorType: 'ToolExecutionException',
        errorMessage: 'intentional MCP tool failure',
        errorStack: 'Traceback...',
      }),
    ]
    const result = buildConversation(spans).find((e) => e.kind === 'tool_result')
    expect(result).toMatchObject({
      callId: 'call-x',
      success: false,
      error: { kind: 'ToolExecutionException', message: 'intentional MCP tool failure', stack: 'Traceback...' },
    })
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

describe('buildConversation — orchestrator grouping', () => {
  function agentSpan(p: Partial<Span> & { id: string }): Span {
    return {
      traceId: 't',
      parentId: null,
      service: 's',
      kind: 'internal',
      operation: 'invoke_agent',
      name: `invoke_agent ${p.id}`,
      startMs: 0,
      endMs: 0,
      ...p,
    } as Span
  }
  function execToolSpan(p: Partial<Span> & { id: string; startMs: number }): Span {
    return {
      traceId: 't',
      parentId: null,
      service: 's',
      kind: 'internal',
      operation: 'tool',
      name: 'execute_tool sub',
      endMs: p.startMs,
      ...p,
    } as Span
  }

  it('groups an HTTP-invoked orchestrator’s children under it and nests the agent-as-tool', () => {
    const spans: Span[] = [
      agentSpan({ id: 'orch', agentName: 'Orchestrator' }),
      chatSpan({
        id: 'c1',
        parentId: 'orch',
        startMs: 1,
        endMs: 2,
        llmInput: [userMsg('do it')],
        llmOutput: [
          { role: 'assistant', parts: [{ type: 'tool_call', id: 'call_sub', name: 'sub_agent', arguments: {} }] },
        ],
      }),
      execToolSpan({
        id: 'tcall',
        parentId: 'orch',
        startMs: 3,
        endMs: 6,
        toolName: 'sub_agent',
        toolCallId: 'call_sub',
        toolResult: { ok: true },
      }),
      agentSpan({ id: 'sub', parentId: 'tcall', agentName: 'SubAgent', startMs: 4, endMs: 5 }),
      chatSpan({
        id: 'c2',
        parentId: 'sub',
        startMs: 4,
        endMs: 5,
        llmInput: [userMsg('sub task')],
        llmOutput: [asstMsg('done')],
      }),
    ]
    const events = buildConversation(spans)

    const user = events.find((e) => e.kind === 'message' && e.content === 'do it')
    expect(user?.orchestratorSpanId).toBe('orch')
    expect(user?.parentAgentSpanId).toBeUndefined()

    const agentCall = events.find((e) => e.kind === 'agent_call')
    expect(agentCall?.kind).toBe('agent_call')
    if (agentCall?.kind === 'agent_call') {
      expect(agentCall.agentName).toBe('SubAgent')
      expect(agentCall.orchestratorSpanId).toBe('orch')
      expect(agentCall.parentAgentSpanId).toBeUndefined()
    }

    const nested = events.find((e) => e.kind === 'message' && e.content === 'done')
    expect(nested?.parentAgentSpanId).toBe('tcall')
    expect(nested?.orchestratorSpanId).toBe('orch')
  })

  it('maps each event to its own orchestrator across two sequential runs', () => {
    const spans: Span[] = [
      agentSpan({ id: 'A', traceId: 'tA', agentName: 'AgentA', startMs: 0 }),
      chatSpan({
        id: 'cA',
        traceId: 'tA',
        parentId: 'A',
        startMs: 1,
        endMs: 2,
        llmInput: [userMsg('q1')],
        llmOutput: [asstMsg('a1')],
      }),
      agentSpan({ id: 'B', traceId: 'tB', agentName: 'AgentB', startMs: 10 }),
      chatSpan({
        id: 'cB',
        traceId: 'tB',
        parentId: 'B',
        startMs: 11,
        endMs: 12,
        llmInput: [userMsg('q2')],
        llmOutput: [asstMsg('a2')],
      }),
    ]
    const events = buildConversation(spans)
    const orchOf = (content: string) =>
      events.find((e) => e.kind === 'message' && e.content === content)?.orchestratorSpanId
    expect(orchOf('q1')).toBe('A')
    expect(orchOf('a1')).toBe('A')
    expect(orchOf('q2')).toBe('B')
    expect(orchOf('a2')).toBe('B')
  })

  it('leaves events ungrouped (flat) when there is no invoke_agent', () => {
    const spans: Span[] = [
      chatSpan({ id: 'c', startMs: 0, endMs: 1, llmInput: [userMsg('hi')], llmOutput: [asstMsg('yo')] }),
    ]
    for (const e of buildConversation(spans)) expect(e.orchestratorSpanId).toBeUndefined()
  })

  it('degrades to flat when the orchestrator span is missing (ingestion lag)', () => {
    const spans: Span[] = [
      chatSpan({
        id: 'c1',
        parentId: 'orch',
        startMs: 1,
        endMs: 2,
        llmInput: [userMsg('do it')],
        llmOutput: [
          { role: 'assistant', parts: [{ type: 'tool_call', id: 'call_sub', name: 'sub_agent', arguments: {} }] },
        ],
      }),
      execToolSpan({
        id: 'tcall',
        parentId: 'orch',
        startMs: 3,
        endMs: 6,
        toolName: 'sub_agent',
        toolCallId: 'call_sub',
        toolResult: { ok: true },
      }),
      agentSpan({ id: 'sub', parentId: 'tcall', agentName: 'SubAgent', startMs: 4, endMs: 5 }),
      chatSpan({
        id: 'c2',
        parentId: 'sub',
        startMs: 4,
        endMs: 5,
        llmInput: [userMsg('sub task')],
        llmOutput: [asstMsg('done')],
      }),
    ]
    const events = buildConversation(spans)
    const user = events.find((e) => e.kind === 'message' && e.content === 'do it')
    expect(user?.orchestratorSpanId).toBeUndefined()
    const agentCall = events.find((e) => e.kind === 'agent_call')
    expect(agentCall?.orchestratorSpanId).toBeUndefined()
    expect(agentCall?.parentAgentSpanId).toBeUndefined()
    // Nested sub-agent chat keeps parentAgentSpanId, so the view drops it inside the AgentCard.
    const nested = events.find((e) => e.kind === 'message' && e.content === 'done')
    expect(nested?.parentAgentSpanId).toBe('tcall')
  })
})
