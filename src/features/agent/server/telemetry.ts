import { OpenTelemetry } from '@ai-sdk/otel'
import type { Tracer } from '@opentelemetry/api'
// Protobuf OTLP to the local collector (infra/clickhouse), which exports to the
// ClickHouse that loupe reads. Same pipe any instrumented agent uses.
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node'

/**
 * Cached on a global symbol so vite SSR's HMR re-evaluation reuses one BatchSpanProcessor.
 */
const TRACER = Symbol.for('loupe.agent.otel.tracer')

function agentTracer(): Tracer {
  const g = globalThis as Record<symbol, unknown>
  const cached = g[TRACER] as Tracer | undefined
  if (cached) return cached

  // Collector OTLP/HTTP endpoint; defaults to the local infra/clickhouse collector.
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318'
  const exporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` })
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'loupe-agent' }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  })
  const tracer = provider.getTracer('gen_ai')
  g[TRACER] = tracer
  return tracer
}

/**
 * @ai-sdk/otel emits OTel GenAI semconv natively; enrichSpan adds what the SDK has
 * no native concept of: the session key loupe groups by, and the acting user so the
 * run is attributed in loupe's Sessions/Traces (UserId/UserName ← user.id/user.name).
 */
export function agentTelemetry(sessionId?: string, user?: { id: string; name: string }) {
  const attrs: Record<string, string> = {}
  // A chat session maps to one gen_ai.conversation.id (the semconv key loupe groups by).
  if (sessionId) attrs['gen_ai.conversation.id'] = sessionId
  if (user) {
    attrs['user.id'] = user.id
    attrs['user.name'] = user.name
  }
  const enrichSpan = Object.keys(attrs).length > 0 ? () => attrs : undefined
  return {
    isEnabled: true,
    // @ai-sdk/otel maps functionId → gen_ai.agent.name; else loupe names the agent by its model.
    functionId: 'loupe agent',
    integrations: [new OpenTelemetry({ tracer: agentTracer(), usage: true, enrichSpan })],
  }
}
