import { beforeEach, describe, expect, it, vi } from 'vitest'
import { spanHasError } from '#/features/inspect/logic/predicates'
import { toolError } from '#/lib/spans/conversation'
import { countTokens } from '#/lib/tokens'
import { fetchTools } from './analytics-clickhouse'
import { chString, createClickHouseProvider, normalizeClickHouseRow } from './clickhouse'
import { chCol } from './conventions'
import type { ClickHouseProvider } from './types'

const ch = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; query_params?: Record<string, unknown> }>,
  rows: [] as Array<Record<string, unknown>>,
}))

vi.mock('@clickhouse/client', () => ({
  createClient: () => ({
    query: async (opts: { query: string; query_params?: Record<string, unknown> }) => {
      ch.calls.push(opts)
      return { json: async () => ch.rows }
    },
  }),
}))

const cfg = { url: 'http://ch', database: 'loupe', username: 'u', password: 'p' }

beforeEach(() => {
  ch.calls = []
  ch.rows = []
})

describe('chCol', () => {
  it('resolves promoted fields to their column', () => {
    expect(chCol('sessionId')).toBe('SessionId')
    expect(chCol('host')).toBe('Host')
    expect(chCol('costUsd')).toBe('CostUsd')
  })

  it('falls back to a map coalesce for non-promoted fields', () => {
    expect(chCol('llmInput')).toBe(
      "arrayFirst(v -> v != '', [SpanAttributes['gen_ai.input.messages'], SpanAttributes['llm.input']])",
    )
    expect(chCol('llmPurpose')).toBe('Purpose')
  })
})

describe('chString', () => {
  it('escapes backslashes so a trailing one cannot swallow the closing quote', () => {
    expect(chString('a\\')).toBe("'a\\\\'")
    expect(chString("o'brien")).toBe("'o\\'brien'")
  })
})

describe('normalizeClickHouseRow', () => {
  const chatRow = {
    trace_id: 'd180744d35a0660e31f4c207ff52d59d',
    span_id: '205b45336efe7efc',
    parent_span_id: 'c6eda740bcf460ad',
    operation_name: 'chat claude-haiku-4-5',
    span_kind: 'Client',
    service_name: 'Aporia.Cli',
    start_ms: '1780601600962',
    duration_ms: '4979',
    span_status: '',
    status_message: '',
    session_title: '',
    span_attributes: {
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': 'claude-haiku-4-5',
      'gen_ai.usage.input_tokens': '24807',
      'gen_ai.usage.output_tokens': '446',
      'gen_ai.usage.total_tokens': '25253',
      'session.id': 'sess-1',
    },
    resource_attributes: { 'host.name': 'h1' },
    event_names: [],
    event_attributes: [],
  }

  it('maps a chat row: ms timing, client kind, tokens/model/session', () => {
    const s = normalizeClickHouseRow(chatRow)
    expect(s.id).toBe('205b45336efe7efc')
    expect(s.traceId).toBe('d180744d35a0660e31f4c207ff52d59d')
    expect(s.parentId).toBe('c6eda740bcf460ad')
    expect(s.service).toBe('Aporia.Cli')
    expect(s.kind).toBe('client')
    expect(s.operation).toBe('chat')
    expect(s.startMs).toBe(1_780_601_600_962)
    expect(s.endMs).toBe(1_780_601_605_941)
    expect(s.model).toBe('claude-haiku-4-5')
    expect(s.tokens).toBe(25253)
    expect(s.inputTokens).toBe(24807)
    expect(s.outputTokens).toBe(446)
    expect(s.sessionSource).toBe('attribute')
    expect(s.hasError).toBeUndefined()
    // Resource attrs are merged into the bag classifySpan reads.
    expect(s.rawAttributes?.['host.name']).toBe('h1')
  })

  const stack =
    'Traceback (most recent call last):\n  File "_tools.py", line 734, in invoke\n    raise ToolExecutionException(...)\n'
  const crashRow = {
    trace_id: '616d95d37db76bb490de6ce82b84d0fd',
    span_id: 'f8850ef32fe47108',
    parent_span_id: '4d5826ef78012c37',
    operation_name: 'execute_tool crash',
    span_kind: 'SPAN_KIND_INTERNAL',
    service_name: 'maf-sandbox',
    start_ms: '1780836257291',
    duration_ms: '99',
    span_status: 'ERROR',
    status_message: "ToolExecutionException('Error executing tool crash: intentional MCP tool failure')",
    span_attributes: {
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': 'crash',
      'gen_ai.tool.call.id': 'call_l7LXnc8EEA9zCj1XyVW3L4tk',
    },
    resource_attributes: {},
    event_names: ['exception'],
    event_attributes: [
      {
        'exception.type': 'agent_framework.exceptions.ToolExecutionException',
        'exception.message': 'Error executing tool crash: intentional MCP tool failure',
        'exception.stacktrace': stack,
      },
    ],
  }

  it('recovers error type/message/stack from the Events arrays', () => {
    const s = normalizeClickHouseRow(crashRow)
    expect(s.operation).toBe('tool')
    expect(s.toolName).toBe('crash')
    expect(s.hasError).toBe(true)
    expect(s.errorType).toBe('agent_framework.exceptions.ToolExecutionException')
    expect(s.errorMessage).toBe('Error executing tool crash: intentional MCP tool failure')
    expect(s.errorStack).toBe(stack)
    expect(spanHasError(s)).toBe(true)
    expect(toolError(s)).toEqual({
      kind: 'agent_framework.exceptions.ToolExecutionException',
      message: 'Error executing tool crash: intentional MCP tool failure',
      stack,
    })
  })

  it('falls back to status_message when no exception event is present', () => {
    const s = normalizeClickHouseRow({ ...crashRow, event_names: [], event_attributes: [] })
    expect(s.hasError).toBe(true)
    expect(s.errorMessage).toBe("ToolExecutionException('Error executing tool crash: intentional MCP tool failure')")
  })

  it('accepts both pdata and SPAN_KIND_* kind forms', () => {
    expect(normalizeClickHouseRow({ ...chatRow, span_kind: 'SPAN_KIND_CLIENT' }).kind).toBe('client')
    expect(normalizeClickHouseRow({ ...chatRow, span_kind: 'Internal' }).kind).toBe('internal')
  })
})

describe('provider queries', () => {
  it('listTraces reads the trace_list view, binding window/service as params and facets as a filter', async () => {
    await createClickHouseProvider(cfg).listTraces?.({
      triggerTypes: ['scheduled', 'event'],
      serviceName: 'svc-x',
      limit: 500,
      fromUs: 1_000_000,
      toUs: 2_000_000,
    })
    const { query: sql, query_params } = ch.calls[0]
    expect(sql).toContain('FROM trace_list(p_from={from_us:Int64}, p_to={to_us:Int64}, p_svc={svc:String})')
    expect(sql).toMatch(/WHERE[\s\S]*root_trigger_type IN \{trigger_types:Array\(String\)\}/)
    expect(sql.indexOf('WHERE')).toBeLessThan(sql.lastIndexOf('LIMIT'))
    expect(query_params).toMatchObject({
      from_us: 1_000_000,
      to_us: 2_000_000,
      trigger_types: ['scheduled', 'event'],
      svc: 'svc-x',
    })
  })

  it('listTraces prefers the agent-name attr over the model in the span name', async () => {
    ch.rows = [{ trace_id: 't1', sample_agent: 'invoke_agent gpt-5-nano', sample_agent_name: 'loupe agent' }]
    const traces = (await createClickHouseProvider(cfg).listTraces?.({}))?.traces ?? []
    expect(traces[0]?.agent).toBe('loupe agent')
  })

  it('listTraces falls back to parsing the span name when the attr is empty', async () => {
    ch.rows = [{ trace_id: 't2', sample_agent: 'invoke_agent Reviewer', sample_agent_name: '' }]
    const traces = (await createClickHouseProvider(cfg).listTraces?.({}))?.traces ?? []
    expect(traces[0]?.agent).toBe('Reviewer')
  })

  it('getTrace resolves the window from trace_summary, falling back to a span-id lookup', async () => {
    await createClickHouseProvider(cfg).getTrace('deadbeef')
    expect(ch.calls).toHaveLength(2)
    expect(ch.calls[0].query).toContain('FROM trace_summary WHERE trace_id = {id:String}')
    expect(ch.calls[1].query).toContain('SpanId = {id:String}')
  })

  it('getTrace fetches spans inside the padded summary window', async () => {
    ch.rows = [{ from_us: '5000000', to_us: '9000000', trace_id: 'deadbeef', span_id: 's1' }]
    await createClickHouseProvider(cfg).getTrace('deadbeef')
    expect(ch.calls[1].query).toContain('TraceId IN {trace_ids:Array(String)}')
    expect(ch.calls[1].query_params).toMatchObject({ trace_ids: ['deadbeef'], from_us: 4_000_000, to_us: 10_000_000 })
  })

  it('listSessions pages over session_list, filtering identity via bound params', async () => {
    await createClickHouseProvider(cfg).listSessions?.({ host: 'box-1', userId: 'u-9', limit: 25, offset: 50 })
    const { query: sql, query_params } = ch.calls[0]
    expect(sql).toContain('FROM session_list(')
    expect(sql).toContain('user_id = {uid:String}')
    expect(sql).toContain('host = {host:String}')
    expect(sql).toContain('LIMIT 26 OFFSET 50')
    expect(query_params).toMatchObject({ uid: 'u-9', host: 'box-1' })
  })

  it('listTraces filters category via the SQL multiIf expression, bound as a param', async () => {
    await createClickHouseProvider(cfg).listTraces?.({ category: 'utility', search: 'x' })
    const { query: sql, query_params } = ch.calls[0]
    expect(sql).toContain('multiIf(')
    expect(sql).toContain('= {category:String}')
    expect(query_params).toMatchObject({ category: 'utility', search: '%x%' })
  })

  it('listTraces decodes a task key into an exact trace_list filter', async () => {
    await createClickHouseProvider(cfg).listTraces?.({ taskKey: 'task:nightly' })
    expect(ch.calls[0].query).toContain('root_task_id = {tk_id:String}')
    expect(ch.calls[0].query_params).toMatchObject({ tk_id: 'nightly' })
  })

  it('listSpans maps kind to the Purpose predicate', async () => {
    const p = createClickHouseProvider(cfg)
    await p.listSpans?.({ kind: 'utility' })
    expect(ch.calls[0].query).toContain("AND Purpose != ''")
    ch.calls = []
    await p.listSpans?.({ kind: 'sub-agent', minTokens: 100 })
    expect(ch.calls[0].query).toContain("AND Purpose = ''")
    expect(ch.calls[0].query).toContain('>= {min_tokens:Int64}')
    expect(ch.calls[0].query_params).toMatchObject({ min_tokens: 100 })
  })

  it('listTaskRollup groups fire traces by task identity in SQL', async () => {
    await createClickHouseProvider(cfg).listTaskRollup?.({ userId: 'u-1' })
    const { query: sql, query_params } = ch.calls[0]
    expect(sql).toMatch(/root_trigger_type IN \('scheduled', 'event', 'webhook'\)/)
    expect(sql).toContain('GROUP BY key')
    expect(sql).toContain('ORDER BY fires DESC')
    expect(sql).toContain('trace_user_id = {uid:String}')
    expect(query_params).toMatchObject({ uid: 'u-1' })
  })
})

describe('fetchTools maxTokens is the token-max, not the char-longest body tokenized', () => {
  const SPARSE_BODY = 'the quick brown fox jumps over the lazy dog '.repeat(180)
  const DENSE_BODY = 'エラー: 注文の処理に失敗しました。再試行してください。'.repeat(110)

  const provider = (queries: string[]) =>
    ({
      name: 'clickhouse',
      table: 'otel_traces',
      logsTable: 'otel_logs',
      fingerprint: 'f',
      query: async (sql: string) => {
        queries.push(sql)
        return /AS body/.test(sql)
          ? [DENSE_BODY, SPARSE_BODY].map((body) => ({ name: 'execute_tool echo', body }))
          : [{ name: 'execute_tool echo', calls: 2, calls_with_result: 2, max_chars: SPARSE_BODY.length }]
      },
    }) as unknown as ClickHouseProvider

  it('tokenizes all candidates and reports the densest, not the longest', async () => {
    const [row] = await fetchTools(provider([]))
    expect(row.maxTokens).toBe(countTokens(DENSE_BODY))
    expect(row.maxTokens).not.toBe(countTokens(SPARSE_BODY))
  })

  it('uses a direct candidate query for a single tool', async () => {
    const queries: string[] = []
    const [row] = await fetchTools(provider(queries), { name: 'echo' })
    expect(row.maxTokens).toBe(countTokens(DENSE_BODY))
    expect(queries.some((sql) => /row_number/.test(sql))).toBe(false)
  })

  it('filters dimensions on promoted columns', async () => {
    const queries: string[] = []
    await fetchTools(provider(queries), { dimensions: [{ field: 'userId', value: 'u-1' }] })
    expect(queries[0]).toContain("UserId = 'u-1'")
  })

  it('emits ORDER BY / LIMIT / OFFSET from sort + offset opts', async () => {
    const queries: string[] = []
    await fetchTools(provider(queries), { sortBy: 'errorRate', sortDir: 'asc', offset: 50, limit: 25 })
    const agg = queries.find((q) => /GROUP BY SpanName/.test(q)) ?? ''
    expect(agg).toContain('ORDER BY errors / calls ASC')
    expect(agg).toContain('LIMIT 25 OFFSET 50')
  })
})
