import { describe, expect, it } from 'vitest'
import { aggregateSessions, findSessionKey, mapLatencyRow, pickIdentityValue } from './shared'

const NS_PER_MS = 1_000_000

type Row = Record<string, unknown>

function invokeAgent(opts: {
  trace: string
  span: string
  parent?: string
  agent: string
  hex: string
  startMs: number
  endMs?: number
}): Row {
  return {
    trace_id: opts.trace,
    span_id: opts.span,
    reference_parent_span_id: opts.parent ?? null,
    operation_name: `invoke_agent ${opts.agent}(${opts.hex})`,
    start_time: opts.startMs * NS_PER_MS,
    end_time: (opts.endMs ?? opts.startMs + 100) * NS_PER_MS,
  }
}

function chat(opts: {
  trace: string
  span: string
  parent: string
  startMs: number
  tokens?: number
  cost?: number
  error?: boolean
}): Row {
  return {
    trace_id: opts.trace,
    span_id: opts.span,
    reference_parent_span_id: opts.parent,
    operation_name: 'chat gpt-4o-mini',
    gen_ai_operation_name: 'chat',
    start_time: opts.startMs * NS_PER_MS,
    end_time: (opts.startMs + 50) * NS_PER_MS,
    llm_usage_tokens_total: opts.tokens,
    llm_usage_cost_total: opts.cost,
    span_status: opts.error ? 'ERROR' : 'OK',
  }
}

describe('findSessionKey', () => {
  it('returns attribute id when ag_ui_thread_id is present', () => {
    const rows: Row[] = [{ ag_ui_thread_id: 'thread-abc', operation_name: 'chat', trace_id: 't1' }]
    expect(findSessionKey(rows, 't1')).toEqual({ id: 'thread-abc', source: 'attribute' })
  })

  it('prefers attribute over trace fallback when both apply', () => {
    const rows: Row[] = [
      invokeAgent({ trace: 't1', span: 'a', agent: 'Bot', hex: 'deadbeef', startMs: 0 }),
      { ag_ui_thread_id: 'thread-abc', trace_id: 't1' },
    ]
    expect(findSessionKey(rows, 't1')).toEqual({ id: 'thread-abc', source: 'attribute' })
  })

  it('falls back to the trace id when no session attribute is set', () => {
    const rows: Row[] = [invokeAgent({ trace: 't1', span: 'a', agent: 'Bot', hex: 'deadbeef', startMs: 0 })]
    expect(findSessionKey(rows, 't1')).toEqual({ id: 't1', source: 'trace' })
  })

  it('uses rows[0].trace_id when no fallback is passed', () => {
    const rows: Row[] = [chat({ trace: 't42', span: 'c', parent: 'x', startMs: 0 })]
    expect(findSessionKey(rows)).toEqual({ id: 't42', source: 'trace' })
  })

  it('returns undefined when there is no trace id anywhere', () => {
    const rows: Row[] = [{ operation_name: 'chat' }]
    expect(findSessionKey(rows)).toBeUndefined()
  })
})

describe('aggregateSessions', () => {
  it('groups traces by attribute session id', () => {
    const hits: Row[] = [
      {
        trace_id: 't1',
        span_id: 'a',
        operation_name: 'invoke_agent Bot(11)',
        ag_ui_thread_id: 'thread-1',
        start_time: 1000 * NS_PER_MS,
        end_time: 1100 * NS_PER_MS,
      },
      {
        trace_id: 't2',
        span_id: 'b',
        operation_name: 'invoke_agent Bot(22)',
        ag_ui_thread_id: 'thread-1',
        start_time: 2000 * NS_PER_MS,
        end_time: 2100 * NS_PER_MS,
      },
    ]
    const out = aggregateSessions(hits, 10)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ sessionId: 'thread-1', source: 'attribute', traceCount: 2, agents: ['Bot'] })
  })

  it('rolls up tokens, cost, and error flag across traces sharing a session attribute', () => {
    const hits: Row[] = [
      { ...invokeAgent({ trace: 't1', span: 'a', agent: 'Bot', hex: 'aaaa', startMs: 1000 }), ag_ui_thread_id: 'th-1' },
      {
        ...chat({ trace: 't1', span: 'c1', parent: 'a', startMs: 1010, tokens: 100, cost: 0.001 }),
        ag_ui_thread_id: 'th-1',
      },
      { ...invokeAgent({ trace: 't2', span: 'b', agent: 'Bot', hex: 'aaaa', startMs: 2000 }), ag_ui_thread_id: 'th-1' },
      {
        ...chat({ trace: 't2', span: 'c2', parent: 'b', startMs: 2010, tokens: 50, cost: 0.0005, error: true }),
        ag_ui_thread_id: 'th-1',
      },
    ]
    const [session] = aggregateSessions(hits, 10)
    expect(session.sessionId).toBe('th-1')
    expect(session.source).toBe('attribute')
    expect(session.traceCount).toBe(2)
    expect(session.totalTokens).toBe(150)
    expect(session.totalCostUsd).toBeCloseTo(0.0015)
    expect(session.hasError).toBe(true)
  })

  it('derives cost when row lacks llm_usage_cost_total (App Insights path)', () => {
    const hits: Row[] = [
      { ...invokeAgent({ trace: 't1', span: 'a', agent: 'Bot', hex: 'aaaa', startMs: 1000 }), ag_ui_thread_id: 'th-1' },
      {
        trace_id: 't1',
        span_id: 'c1',
        reference_parent_span_id: 'a',
        operation_name: 'chat gpt-5.2',
        gen_ai_operation_name: 'chat',
        gen_ai_request_model: 'gpt-5.2',
        gen_ai_provider_name: 'openai',
        gen_ai_usage_input_tokens: 169,
        gen_ai_usage_output_tokens: 15,
        start_time: 1010 * NS_PER_MS,
        end_time: 1060 * NS_PER_MS,
        span_status: 'OK',
        ag_ui_thread_id: 'th-1',
        // intentionally no llm_usage_cost_total — simulates App Insights row
      },
    ]
    const [session] = aggregateSessions(hits, 10)
    // gpt-5.2: 169 * 1.75/M + 15 * 14/M = 0.00050575
    expect(session.totalCostUsd).toBeCloseTo(0.00050575, 8)
  })

  it('drops traces without a session attribute — those belong on the Runs page', () => {
    const hits: Row[] = [
      invokeAgent({ trace: 't1', span: 'p', agent: 'Proverbs', hex: 'aaaa', startMs: 1000 }),
      invokeAgent({ trace: 't2', span: 'p2', agent: 'Proverbs', hex: 'aaaa', startMs: 2000 }),
    ]
    expect(aggregateSessions(hits, 10)).toEqual([])
  })

  it('respects the limit', () => {
    const hits: Row[] = [
      { ...invokeAgent({ trace: 't1', span: 'a', agent: 'A', hex: '1111', startMs: 1000 }), ag_ui_thread_id: 'th-1' },
      { ...invokeAgent({ trace: 't2', span: 'b', agent: 'B', hex: '2222', startMs: 2000 }), ag_ui_thread_id: 'th-2' },
      { ...invokeAgent({ trace: 't3', span: 'c', agent: 'C', hex: '3333', startMs: 3000 }), ag_ui_thread_id: 'th-3' },
    ]
    expect(aggregateSessions(hits, 2)).toHaveLength(2)
  })
})

describe('mapLatencyRow', () => {
  it('maps p{N}_ms aliases and rounds non-integers', () => {
    expect(
      mapLatencyRow({ name: 'chat gpt-4o', p50_ms: 100.4, p90_ms: 200.6, p95_ms: 300, p99_ms: 400, count: 27 }),
    ).toEqual({ name: 'chat gpt-4o', p50Ms: 100, p90Ms: 201, p95Ms: 300, p99Ms: 400, count: 27 })
  })

  it('falls back to operation_name when name is absent', () => {
    expect(mapLatencyRow({ operation_name: 'invoke_agent Bot' })).toMatchObject({ name: 'invoke_agent Bot' })
  })

  it('clamps null/undefined/negative to zero', () => {
    expect(mapLatencyRow({ name: 'x', p50_ms: null, p90_ms: undefined, p95_ms: -5, p99_ms: 'NaN' })).toEqual({
      name: 'x',
      p50Ms: 0,
      p90Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      count: 0,
    })
  })
})

describe('pickIdentityValue', () => {
  it('returns id when userId is set', () => {
    expect(pickIdentityValue({ userId: 'u1' })).toEqual({ kind: 'id', value: 'u1' })
  })
  it('prefers userId over userName when both are set', () => {
    expect(pickIdentityValue({ userId: 'u1', userName: 'alice' })).toEqual({ kind: 'id', value: 'u1' })
  })
  it('returns name when only userName is set', () => {
    expect(pickIdentityValue({ userName: 'alice' })).toEqual({ kind: 'name', value: 'alice' })
  })
  it('returns undefined when nothing is set', () => {
    expect(pickIdentityValue(undefined)).toBeUndefined()
    expect(pickIdentityValue({})).toBeUndefined()
  })
})
