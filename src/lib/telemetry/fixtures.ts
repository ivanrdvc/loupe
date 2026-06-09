import type { Span } from '#/lib/spans'
import type {
  FixturesProvider,
  InventoryObservation,
  SessionFetch,
  SessionSummary,
  SpanSummary,
  ToolCallSample,
  ToolCatalogRow,
  ToolDetail,
  ToolErrorRow,
  ToolPayloadRow,
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
    operation: 'http',
    name: 'POST api.openai.com/v1/chat/completions',
    sessionId: 'e2e-session-raw',
    sessionSource: 'attribute',
    rawAttributes: { 'url.full': 'https://api.openai.com/v1/chat/completions' },
  }),
]

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
      sessionId: 'e2e-session-raw',
      title: 'Raw spans toggle',
      source: 'attribute',
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

const ALL_SPANS = [...CHAT_SPANS, ...SINGLE_TRACE_SPANS, ...RAW_SPANS]

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
export const FIXTURE_TOOL_CATALOG: ToolCatalogRow[] = [
  {
    name: 'run_sql',
    calls: 100,
    errors: 12,
    errorRate: 0.12,
    avgChars: 520,
    p95Chars: 1600,
    p50Ms: 40,
    p95Ms: 1200,
    lastSeenMs: 1_700_000_000_000,
  },
  {
    name: 'get_weather',
    calls: 40,
    errors: 3,
    errorRate: 0.075,
    avgChars: 1200,
    p95Chars: 4000,
    p50Ms: 30,
    p95Ms: 900,
    lastSeenMs: 1_700_000_000_000,
  },
  {
    name: 'search_docs',
    calls: 25,
    errors: 0,
    errorRate: 0,
    avgChars: 800,
    p95Chars: 1600,
    p50Ms: 20,
    p95Ms: 400,
    lastSeenMs: 1_700_000_000_000,
  },
]

export const FIXTURE_INVENTORY: InventoryObservation[] = [
  {
    kind: 'agent',
    name: 'WeatherBot',
    namespace: '',
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
    namespace: '',
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

export const FIXTURE_TOOL_PAYLOADS: ToolPayloadRow[] = [
  {
    name: 'get_weather',
    avgChars: 1200,
    p95Chars: 4000,
    maxChars: 8200,
    count: 40,
    sampleTraceId: 'tr-chat',
    sampleSessionId: 'e2e-session-chat',
  },
  { name: 'search_docs', avgChars: 800, p95Chars: 1600, maxChars: 3100, count: 25, sampleTraceId: 'tr-chat' },
]

export function fixtureToolDetail(name: string): ToolDetail | null {
  const row = FIXTURE_TOOL_CATALOG.find((r) => r.name === name)
  if (!row) return null
  return {
    name: row.name,
    calls: row.calls,
    errors: row.errors,
    errorRate: row.errorRate,
    avgChars: row.avgChars,
    p95Chars: row.p95Chars,
    maxChars: Math.round(row.p95Chars * 1.5),
    p50Ms: row.p50Ms,
    p95Ms: row.p95Ms,
    firstSeenMs: 1_700_000_000_000,
    lastSeenMs: row.lastSeenMs,
  }
}

export function fixtureToolRecentCalls(name: string): ToolCallSample[] {
  if (!FIXTURE_TOOL_CATALOG.some((r) => r.name === name)) return []
  return [
    {
      traceId: 'tr-chat',
      sessionId: 'e2e-session-chat',
      startedAtMs: 1_700_000_000_000,
      durationMs: 40,
      hasError: false,
    },
    {
      traceId: 'tr-chat',
      sessionId: 'e2e-session-chat',
      startedAtMs: 1_700_000_000_050,
      durationMs: 1200,
      hasError: name === 'run_sql',
    },
  ]
}

export function createFixturesProvider(): FixturesProvider {
  return {
    name: 'fixtures',
    fingerprint: 'fixtures',
    async getTrace(traceId: string): Promise<TraceFetch> {
      const spans = ALL_SPANS.filter((s) => s.traceId === traceId)
      return spans.length > 0 ? { spans } : null
    },
    async listSessions() {
      return { sessions: SESSIONS.map((s) => s.summary), truncated: false }
    },
    async getSession(sessionId: string): Promise<SessionFetch> {
      return SESSIONS.find((s) => s.summary.sessionId === sessionId)?.fetch ?? null
    },
    async listTraces() {
      return TRACES
    },
    async listSpans() {
      return SPAN_SUMMARIES
    },
    async query() {
      return []
    },
  }
}
