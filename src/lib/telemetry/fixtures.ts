import type { Span } from '#/lib/spans'
import type {
  FixturesProvider,
  InventoryObservation,
  ListSort,
  RawPayloadBody,
  SessionFetch,
  SessionSummary,
  SpanSummary,
  TaskRollupRow,
  ToolCallSample,
  ToolErrorRow,
  ToolPayloadPoint,
  ToolRow,
  TraceFetch,
  TraceSummary,
} from './types'

// Deterministic, in-memory telemetry for the e2e suite. Selected when
// TELEMETRY_PROVIDER=fixtures (see index.ts). The span/session ids, titles, and
// tool names below are asserted in e2e/fixtures.ts — keep the two in sync.
//
// Time/window opts are intentionally ignored: the suite must not depend on a
// clock, so every fixture session is always returned regardless of range.

function span(
  s: Partial<Span> & Pick<Span, 'id' | 'traceId' | 'operation' | 'name' | 'sessionId' | 'sessionSource'>,
): Span {
  return {
    parentId: null,
    service: 'weather-svc',
    kind: 'internal',
    startMs: 1_700_000_000_000,
    endMs: 1_700_000_000_100,
    ...s,
  }
}

// Multi-turn-shaped session keyed by a real session attribute (source: 'attribute').
const CHAT_SPANS: Span[] = [
  span({
    id: 'sp-agent',
    traceId: 'tr-chat',
    operation: 'invoke_agent',
    name: 'invoke_agent WeatherBot',
    agentName: 'WeatherBot',
    sessionId: 'e2e-session-chat',
    sessionSource: 'attribute',
  }),
  span({
    id: 'sp-chat',
    traceId: 'tr-chat',
    parentId: 'sp-agent',
    operation: 'chat',
    name: 'chat gpt-4o-mini',
    model: 'gpt-4o-mini',
    tokens: 150,
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.0012,
    llmInput: [
      { role: 'system', content: 'You are a helpful weather assistant.' },
      { role: 'user', content: 'What is the weather in Tokyo?' },
    ],
    llmOutput: [{ role: 'assistant', content: 'It is currently 18°C and clear in Tokyo.' }],
    toolDefinitions: [{ type: 'function', name: 'get_weather', description: 'Current weather for a city' }],
    rawAttributes: { 'gen_ai.request.model': 'gpt-4o-mini', 'gen_ai.usage.total_tokens': 150 },
    sessionId: 'e2e-session-chat',
    sessionSource: 'attribute',
  }),
  span({
    id: 'sp-tool',
    traceId: 'tr-chat',
    parentId: 'sp-agent',
    operation: 'tool',
    name: 'get_weather',
    toolName: 'get_weather',
    toolCallId: 'call_1',
    inputParams: '{"city":"Tokyo"}',
    toolResult: '{"tempC":18}',
    sessionId: 'e2e-session-chat',
    sessionSource: 'attribute',
  }),
]

// Single-trace session: no session attribute, so the id is the trace id and
// `source: 'trace'` drives the "single trace" badge.
const SINGLE_TRACE_SPANS: Span[] = [
  span({
    id: 'sp-st-agent',
    traceId: 'e2e-trace-7f3a2b',
    operation: 'invoke_agent',
    name: 'invoke_agent SoloBot',
    agentName: 'SoloBot',
    sessionId: 'e2e-trace-7f3a2b',
    sessionSource: 'trace',
  }),
  span({
    id: 'sp-st-chat',
    traceId: 'e2e-trace-7f3a2b',
    parentId: 'sp-st-agent',
    operation: 'chat',
    name: 'chat gpt-4o',
    model: 'gpt-4o',
    sessionId: 'e2e-trace-7f3a2b',
    sessionSource: 'trace',
  }),
]

// Long root name + a hidden http (infra) child: drives the raw-spans `{}` toggle
// and the "toggle must not get cut off by a long name" layout in e2e.
const RAW_ROOT_NAME =
  'invoke_agent OrchestratorWithAnExtremelyLongAgentNameThatMustTruncateRatherThanPushTheRawToggleOffTheEdge'
const RAW_SPANS: Span[] = [
  span({
    id: 'sp-raw-agent',
    traceId: 'tr-raw',
    operation: 'invoke_agent',
    name: RAW_ROOT_NAME,
    agentName: RAW_ROOT_NAME.replace('invoke_agent ', ''),
    sessionId: 'e2e-session-raw',
    sessionSource: 'attribute',
  }),
  span({
    id: 'sp-raw-chat',
    traceId: 'tr-raw',
    parentId: 'sp-raw-agent',
    operation: 'chat',
    name: 'chat gpt-4o',
    model: 'gpt-4o',
    inputTokens: 100,
    outputTokens: 20,
    sessionId: 'e2e-session-raw',
    sessionSource: 'attribute',
  }),
  span({
    id: 'sp-raw-http',
    traceId: 'tr-raw',
    parentId: 'sp-raw-chat',
    operation: 'unknown',
    name: 'POST api.openai.com/v1/chat/completions',
    sessionId: 'e2e-session-raw',
    sessionSource: 'attribute',
    rawAttributes: { 'url.full': 'https://api.openai.com/v1/chat/completions' },
  }),
]

// Agent-as-tool shape: an HTTP-invoked top-level orchestrator (Orchestrator) that
// calls a data tool and a sub-agent (render_agent) wrapped in execute_tool. Drives
// the conversation view's orchestrator-turn grouping + nested AgentCard.
const AGENT_AS_TOOL_SPANS: Span[] = [
  span({
    id: 'aat-orch',
    traceId: 'tr-aat',
    operation: 'invoke_agent',
    name: 'invoke_agent Orchestrator',
    agentName: 'Orchestrator',
    taskId: 'aat-orch',
    startMs: 1_700_000_000_000,
    endMs: 1_700_000_000_900,
    sessionId: 'e2e-session-agent-tool',
    sessionSource: 'attribute',
  }),
  span({
    id: 'aat-chat1',
    traceId: 'tr-aat',
    parentId: 'aat-orch',
    operation: 'chat',
    name: 'chat gpt-5',
    model: 'gpt-5',
    startMs: 1_700_000_000_010,
    endMs: 1_700_000_000_100,
    inputTokens: 200,
    outputTokens: 30,
    llmInput: [
      { role: 'system', content: 'You are an orchestrator.' },
      { role: 'user', content: 'List all records and render a summary report.' },
    ],
    llmOutput: [
      {
        role: 'assistant',
        parts: [
          { type: 'tool_call', id: 'call_data', name: 'list_records', arguments: {} },
          { type: 'tool_call', id: 'call_ui', name: 'render_agent', arguments: { view: 'report' } },
        ],
      },
    ],
    sessionId: 'e2e-session-agent-tool',
    sessionSource: 'attribute',
  }),
  span({
    id: 'aat-data',
    traceId: 'tr-aat',
    parentId: 'aat-orch',
    operation: 'tool',
    name: 'execute_tool list_records',
    toolName: 'list_records',
    toolCallId: 'call_data',
    inputParams: '{}',
    toolResult: '[{"id":1,"status":"active"}]',
    startMs: 1_700_000_000_110,
    endMs: 1_700_000_000_200,
    sessionId: 'e2e-session-agent-tool',
    sessionSource: 'attribute',
  }),
  span({
    id: 'aat-uicall',
    traceId: 'tr-aat',
    parentId: 'aat-orch',
    operation: 'tool',
    name: 'execute_tool render_agent',
    toolName: 'render_agent',
    toolCallId: 'call_ui',
    inputParams: '{"view":"report"}',
    toolResult: '{"rendered":"Records Report"}',
    startMs: 1_700_000_000_210,
    endMs: 1_700_000_000_800,
    sessionId: 'e2e-session-agent-tool',
    sessionSource: 'attribute',
  }),
  span({
    id: 'aat-ui',
    traceId: 'tr-aat',
    parentId: 'aat-uicall',
    operation: 'invoke_agent',
    name: 'invoke_agent render_agent',
    agentName: 'render_agent',
    taskId: 'aat-ui',
    taskParentId: 'aat-orch',
    startMs: 1_700_000_000_220,
    endMs: 1_700_000_000_790,
    sessionId: 'e2e-session-agent-tool',
    sessionSource: 'attribute',
  }),
  span({
    id: 'aat-chat2',
    traceId: 'tr-aat',
    parentId: 'aat-ui',
    operation: 'chat',
    name: 'chat gpt-5',
    model: 'gpt-5',
    finishReasons: ['stop'],
    startMs: 1_700_000_000_230,
    endMs: 1_700_000_000_780,
    inputTokens: 120,
    outputTokens: 20,
    llmOutput: [{ role: 'assistant', content: 'Rendered the records report.' }],
    sessionId: 'e2e-session-agent-tool',
    sessionSource: 'attribute',
  }),
]

// Mirrors taskIdentity (features/tasks) + the provider taskKeyWhere so the
// fixtures rollup/detail paths agree with the real one.
const FIRE_CATEGORIES = new Set(['scheduled', 'event', 'webhook'])

type SortableRow = { startedAtMs: number; durationMs: number; totalTokens?: number; totalCostUsd?: number }
const sortKey = (sortBy: ListSort | undefined) => (x: SortableRow) =>
  sortBy === 'cost'
    ? (x.totalCostUsd ?? 0)
    : sortBy === 'tokens'
      ? (x.totalTokens ?? 0)
      : sortBy === 'duration'
        ? x.durationMs
        : x.startedAtMs
export function fixtureTaskKey(t: TraceSummary): string {
  if (t.taskId) return `task:${t.taskId}`
  const op = t.rootOperation?.trim()
  if (op && !op.startsWith('invoke_agent') && !op.startsWith('execute_tool') && !op.startsWith('chat'))
    return `op:${op}`
  return `derived:${t.serviceName ?? ''}|${t.agent ?? ''}|${t.category ?? 'orphan'}`
}

interface FixtureSession {
  summary: SessionSummary
  fetch: NonNullable<SessionFetch>
}

const SESSIONS: FixtureSession[] = [
  {
    summary: {
      sessionId: 'e2e-session-chat',
      title: 'Weather in Tokyo',
      source: 'attribute',
      host: 'web-1',
      startedAtMs: 1_700_000_000_000,
      lastSeenMs: 1_700_000_000_100,
      activeDurationMs: 100,
      traceCount: 1,
      agents: ['WeatherBot'],
      firstInput: 'What is the weather in Tokyo?',
      totalTokens: 150,
      totalCostUsd: 0.0012,
    },
    fetch: {
      sessionId: 'e2e-session-chat',
      source: 'attribute',
      traceIds: ['tr-chat'],
      spans: CHAT_SPANS,
      title: 'Weather in Tokyo',
    },
  },
  {
    summary: {
      sessionId: 'e2e-trace-7f3a2b',
      source: 'trace',
      host: 'worker-2',
      startedAtMs: 1_700_000_000_000,
      lastSeenMs: 1_700_000_000_100,
      activeDurationMs: 100,
      traceCount: 1,
      agents: ['SoloBot'],
    },
    fetch: {
      sessionId: 'e2e-trace-7f3a2b',
      source: 'trace',
      traceIds: ['e2e-trace-7f3a2b'],
      spans: SINGLE_TRACE_SPANS,
    },
  },
  {
    summary: {
      sessionId: 'e2e-session-agent-tool',
      title: 'Records report',
      source: 'attribute',
      host: 'web-1',
      startedAtMs: 1_700_000_000_000,
      lastSeenMs: 1_700_000_000_900,
      activeDurationMs: 900,
      traceCount: 1,
      agents: ['Orchestrator', 'render_agent'],
      firstInput: 'List all records and render a summary report.',
      totalTokens: 370,
      totalCostUsd: 0.004,
    },
    fetch: {
      sessionId: 'e2e-session-agent-tool',
      source: 'attribute',
      traceIds: ['tr-aat'],
      spans: AGENT_AS_TOOL_SPANS,
      title: 'Records report',
    },
  },
  {
    summary: {
      sessionId: 'e2e-session-raw',
      title: 'Raw spans toggle',
      source: 'attribute',
      host: 'worker-2',
      startedAtMs: 1_700_000_000_000,
      lastSeenMs: 1_700_000_000_100,
      activeDurationMs: 100,
      traceCount: 1,
      agents: [RAW_ROOT_NAME.replace('invoke_agent ', '')],
      totalTokens: 120,
      totalCostUsd: 0.001,
    },
    fetch: {
      sessionId: 'e2e-session-raw',
      source: 'attribute',
      traceIds: ['tr-raw'],
      spans: RAW_SPANS,
      title: 'Raw spans toggle',
    },
  },
]

const ALL_SPANS = [...CHAT_SPANS, ...SINGLE_TRACE_SPANS, ...RAW_SPANS, ...AGENT_AS_TOOL_SPANS]

const TRACES: TraceSummary[] = [
  {
    id: 'tr-chat',
    startedAtMs: 1_700_000_000_000,
    durationMs: 100,
    spanCount: CHAT_SPANS.length,
    agent: 'WeatherBot',
    serviceName: 'weather-svc',
    sessionId: 'e2e-session-chat',
    totalTokens: 150,
    totalCostUsd: 0.0012,
    category: 'chat',
  },
  {
    id: 'e2e-trace-7f3a2b',
    startedAtMs: 1_700_000_000_000,
    durationMs: 100,
    spanCount: SINGLE_TRACE_SPANS.length,
    agent: 'SoloBot',
    serviceName: 'weather-svc',
    category: 'chat',
  },
  {
    id: 'tr-task-nightly',
    startedAtMs: 1_700_000_000_000,
    durationMs: 250,
    spanCount: 1,
    agent: 'ReportBot',
    serviceName: 'report-svc',
    category: 'scheduled',
    taskId: 'nightly-report',
    taskName: 'Nightly Report',
    taskKind: 'cron',
    taskSchedule: '0 0 * * *',
    totalCostUsd: 0.0123,
    hasError: false,
  },
]

const SPAN_SUMMARIES: SpanSummary[] = [
  {
    spanId: 'sp-st-agent',
    traceId: 'e2e-trace-7f3a2b',
    spanName: 'invoke_agent SoloBot',
    kind: 'sub-agent',
    label: 'SoloBot',
    startedAtMs: 1_700_000_000_000,
    durationMs: 100,
  },
]

// Deterministic tool aggregates so the dashboard, catalog, and drilldown
// drawer have data under TELEMETRY_PROVIDER=fixtures. `run_sql` carries a
// high error rate and `get_weather` a notable one so the home error widget
// and the inspector health hint both render. Asserted in e2e/tools.spec.ts.
// run_sql: high error rate; get_weather: notable payload. Asserted in e2e/tools.spec.ts.
export const FIXTURE_TOOLS: ToolRow[] = [
  {
    name: 'run_sql',
    calls: 100,
    callsWithResult: 100,
    errors: 12,
    errorRate: 0.12,
    avgTokensEst: 130,
    p50TokensEst: 105,
    p95TokensEst: 400,
    maxTokens: 600,
    totalTokensEst: 13_000,
    p50Ms: 40,
    p95Ms: 1200,
    firstSeenMs: 1_700_000_000_000,
    lastSeenMs: 1_700_000_000_000,
    sampleTraceId: 'tr-chat',
    sampleSessionId: 'e2e-session-chat',
  },
  {
    name: 'get_weather',
    calls: 40,
    callsWithResult: 40,
    errors: 3,
    errorRate: 0.075,
    avgTokensEst: 300,
    p50TokensEst: 238,
    p95TokensEst: 1000,
    maxTokens: 2050,
    totalTokensEst: 12_000,
    p50Ms: 30,
    p95Ms: 900,
    firstSeenMs: 1_700_000_000_000,
    lastSeenMs: 1_700_000_000_000,
    sampleTraceId: 'tr-chat',
    sampleSessionId: 'e2e-session-chat',
  },
  {
    name: 'search_docs',
    calls: 25,
    callsWithResult: 25,
    errors: 0,
    errorRate: 0,
    avgTokensEst: 200,
    p50TokensEst: 175,
    p95TokensEst: 400,
    maxTokens: 775,
    totalTokensEst: 5_000,
    p50Ms: 20,
    p95Ms: 400,
    firstSeenMs: 1_700_000_000_000,
    lastSeenMs: 1_700_000_000_000,
    sampleTraceId: 'tr-chat',
  },
]

export const FIXTURE_INVENTORY: InventoryObservation[] = [
  {
    kind: 'agent',
    name: 'WeatherBot',
    firstSeenMs: 1_700_000_000_000,
    lastSeenMs: 1_700_000_000_100,
    traceId: 'tr-chat',
    description: 'Answers weather questions.',
    systemPrompt: 'You are a helpful weather assistant. Be concise.',
    nested: false,
  },
  {
    kind: 'agent',
    name: 'SoloBot',
    firstSeenMs: 1_700_000_000_000,
    lastSeenMs: 1_700_000_000_100,
    traceId: 'e2e-trace-7f3a2b',
    systemPrompt: 'You are SoloBot. Solve the task end to end.',
    nested: true,
  },
]

export const FIXTURE_TOOL_ERRORS: ToolErrorRow[] = [
  { name: 'run_sql', errors: 12, total: 100, errorRate: 0.12, lastErrorTraceId: 'tr-chat' },
  { name: 'get_weather', errors: 3, total: 40, errorRate: 0.075, lastErrorTraceId: 'tr-chat' },
]

export function fixtureTools(name?: string): ToolRow[] {
  return name ? FIXTURE_TOOLS.filter((r) => r.name === name) : FIXTURE_TOOLS
}

export function fixtureToolPayloadBody(spanId: string): RawPayloadBody | null {
  if (!spanId) return null
  return { body: JSON.stringify({ ok: true, span: spanId, rows: 3 }), truncated: false }
}

export function fixtureToolRecentCalls(name: string): ToolCallSample[] {
  if (!FIXTURE_TOOLS.some((r) => r.name === name)) return []
  return [
    {
      traceId: 'tr-chat',
      spanId: 'sp-tool-1',
      sessionId: 'e2e-session-chat',
      startedAtMs: 1_700_000_000_000,
      durationMs: 40,
      hasError: false,
      resultChars: 520,
      resultTokens: 130,
    },
    {
      traceId: 'tr-chat',
      spanId: 'sp-tool-2',
      sessionId: 'e2e-session-chat',
      startedAtMs: 1_700_000_000_050,
      durationMs: 1200,
      hasError: name === 'run_sql',
      resultChars: 1600,
      resultTokens: 400,
    },
  ]
}

export function fixtureToolPayloadOverTime(name: string): ToolPayloadPoint[] {
  if (!FIXTURE_TOOLS.some((r) => r.name === name)) return []
  const base = 1_700_000_000_000
  const hour = 3_600_000
  const growing = name === 'run_sql'
  return Array.from({ length: 8 }, (_, i) => ({
    ts: base + i * hour,
    p95TokensEst: growing ? 200 + i * 260 : 400,
    calls: 5,
  }))
}

export function createFixturesProvider(): FixturesProvider {
  return {
    name: 'fixtures',
    fingerprint: 'fixtures',
    async getTrace(traceId: string): Promise<TraceFetch> {
      const spans = ALL_SPANS.filter((s) => s.traceId === traceId)
      return spans.length > 0 ? { spans } : null
    },
    async listSessions(opts) {
      const all = SESSIONS.map((s) => s.summary).filter((s) => {
        if (opts?.host && s.host !== opts.host) return false
        if (opts?.userId && s.userId !== opts.userId) return false
        return true
      })
      const offset = Math.max(0, opts?.offset ?? 0)
      const limit = opts?.limit ?? all.length
      const page = all.slice(offset, offset + limit + 1)
      const hasMore = page.length > limit
      return { sessions: page.slice(0, limit), hasMore }
    },
    async listHosts() {
      return [...new Set(SESSIONS.map((s) => s.summary.host).filter((h): h is string => !!h))].sort()
    },
    async getSession(sessionId: string): Promise<SessionFetch> {
      return SESSIONS.find((s) => s.summary.sessionId === sessionId)?.fetch ?? null
    },
    async listTraces(opts) {
      const triggers = opts?.triggerTypes as readonly string[] | undefined
      const all = TRACES.filter((t) => {
        if (triggers?.length && !triggers.includes(t.category ?? '')) return false
        if (opts?.serviceName && t.serviceName !== opts.serviceName) return false
        if (opts?.agentName && !(t.agent ?? '').startsWith(opts.agentName)) return false
        if (opts?.category && t.category !== opts.category) return false
        if (opts?.taskKey && fixtureTaskKey(t) !== opts.taskKey) return false
        if (opts?.status === 'error' && !t.hasError) return false
        if (opts?.status === 'ok' && t.hasError) return false
        return true
      })
      const key = sortKey(opts?.sortBy)
      all.sort((a, b) => key(b) - key(a))
      const offset = Math.max(0, opts?.offset ?? 0)
      const limit = opts?.limit ?? all.length
      const page = all.slice(offset, offset + limit + 1)
      return { traces: page.slice(0, limit), hasMore: page.length > limit }
    },
    async listSpans(opts) {
      const all = SPAN_SUMMARIES.filter((s) => {
        if (opts?.kind && s.kind !== opts.kind) return false
        if (opts?.status === 'error' && !s.hasError) return false
        if (opts?.status === 'ok' && s.hasError) return false
        return true
      })
      const key = sortKey(opts?.sortBy)
      all.sort((a, b) => key(b) - key(a))
      const offset = Math.max(0, opts?.offset ?? 0)
      const limit = opts?.limit ?? all.length
      const page = all.slice(offset, offset + limit + 1)
      return { spans: page.slice(0, limit), hasMore: page.length > limit }
    },
    async listTaskRollup(opts) {
      const groups = new Map<string, TraceSummary[]>()
      for (const t of TRACES) {
        if (!t.category || !FIRE_CATEGORIES.has(t.category)) continue
        const key = fixtureTaskKey(t)
        if (opts?.taskKey && key !== opts.taskKey) continue
        const arr = groups.get(key) ?? []
        arr.push(t)
        groups.set(key, arr)
      }
      const rows: TaskRollupRow[] = []
      for (const [key, group] of groups) {
        const sample = group[0]
        if (!sample) continue
        let cost = 0
        let hasCost = false
        for (const t of group)
          if (t.totalCostUsd != null) {
            cost += t.totalCostUsd
            hasCost = true
          }
        rows.push({
          key,
          category: sample.category ?? 'orphan',
          fires: group.length,
          errored: group.filter((t) => t.hasError).length,
          avgDurationMs: Math.round(group.reduce((n, t) => n + t.durationMs, 0) / group.length),
          lastFireMs: group.reduce((m, t) => Math.max(m, t.startedAtMs), 0),
          sampleTraceId: sample.id,
          fireTimestampsMs: group.map((t) => t.startedAtMs),
          ...(sample.taskId ? { taskId: sample.taskId } : {}),
          ...(sample.taskName ? { taskName: sample.taskName } : {}),
          ...(sample.taskKind ? { taskKind: sample.taskKind } : {}),
          ...(sample.taskSchedule ? { taskSchedule: sample.taskSchedule } : {}),
          ...(sample.taskSource ? { taskSource: sample.taskSource } : {}),
          ...(sample.rootOperation ? { rootOperation: sample.rootOperation } : {}),
          ...(sample.agent ? { agent: sample.agent } : {}),
          ...(sample.serviceName ? { serviceName: sample.serviceName } : {}),
          ...(hasCost ? { costUsd: cost } : {}),
        })
      }
      return rows.sort((a, b) => b.fires - a.fires)
    },
    async query() {
      return []
    },
  }
}
