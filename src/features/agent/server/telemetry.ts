import { OpenTelemetry } from '@ai-sdk/otel'
import type { Tracer } from '@opentelemetry/api'
// Protobuf, not JSON: OpenObserve's OTLP/JSON endpoint mis-parses doubleValue attrs and 400s the batch.
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node'

// Cached on a global symbol so vite SSR's HMR re-evaluation reuses one BatchSpanProcessor.
const TRACER = Symbol.for('loupe.agent.otel.tracer')

function agentTracer(): Tracer {
  const g = globalThis as Record<symbol, unknown>
  const cached = g[TRACER] as Tracer | undefined
  if (cached) return cached

  const baseUrl = process.env.OO_BASE_URL ?? 'http://localhost:5080'
  const org = process.env.OO_ORG ?? 'default'
  const user = process.env.OO_USER ?? 'root@example.com'
  const password = process.env.OO_PASS ?? 'Complexpass#123'
  const auth = Buffer.from(`${user}:${password}`).toString('base64')

  const exporter = new OTLPTraceExporter({
    url: `${baseUrl}/api/${org}/v1/traces`,
    headers: { Authorization: `Basic ${auth}`, 'stream-name': process.env.OO_STREAM ?? 'default' },
  })
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'loupe-agent' }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  })
  const tracer = provider.getTracer('gen_ai')
  g[TRACER] = tracer
  return tracer
}

// @ai-sdk/otel emits OTel GenAI semconv natively; enrichSpan adds the session key
// loupe groups by, which the AI SDK has no native concept of.
export function agentTelemetry(sessionId?: string) {
  return {
    isEnabled: true,
    // @ai-sdk/otel maps functionId → gen_ai.agent.name; else loupe names the agent by its model.
    functionId: 'loupe agent',
    integrations: [
      new OpenTelemetry({
        tracer: agentTracer(),
        usage: true,
        // A chat session maps to one gen_ai.conversation.id (the semconv key loupe groups by).
        enrichSpan: sessionId ? () => ({ 'gen_ai.conversation.id': sessionId }) : undefined,
      }),
    ],
  }
}
