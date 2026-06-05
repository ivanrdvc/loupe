import type { Span } from '#/lib/spans'
import type { FixturesProvider, SessionFetch, SessionSummary, SpanSummary, TraceFetch, TraceSummary } from './types'

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
]

const ALL_SPANS = [...CHAT_SPANS, ...SINGLE_TRACE_SPANS]

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
