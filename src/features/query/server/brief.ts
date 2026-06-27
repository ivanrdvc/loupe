import { spanHasError } from '#/features/inspect/logic/predicates'
import type { JsonValue } from '#/lib/json'
import type { Span } from '#/lib/spans'
import { buildConversation } from '#/lib/spans/conversation'
import { getSession, getTrace } from '#/lib/telemetry'
import { markdown, notFound } from '../logic/respond'
import { aggregate } from '../logic/shape'

const oneLine = (v: JsonValue | undefined, limit = 500): string => {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit)} [+${flat.length - limit} chars truncated]`
}

const usd = (n: number) => `$${n.toFixed(3)}`
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`

function header(title: string, agg: ReturnType<typeof aggregate>): string {
  const lines = [
    `# ${title}`,
    '',
    agg.model ? `- model: ${agg.model}` : '',
    `- started: ${agg.started_at}`,
    `- duration: ${secs(agg.duration_ms)}`,
    `- status: ${agg.status}`,
    `- cost: ${usd(agg.total_cost_usd)}`,
    `- tokens: ${agg.input_tokens.toLocaleString()} in / ${agg.output_tokens.toLocaleString()} out`,
    agg.session_id ? `- session: ${agg.session_id}` : '',
  ]
  return lines.filter(Boolean).join('\n')
}

function errorsSection(spans: Span[]): string {
  const errs = spans.filter(spanHasError)
  if (!errs.length) return ''
  const items = errs.map(
    (s, i) =>
      `${i + 1}. \`${s.toolName ?? s.name}\` failed at span ${s.id}:\n   ${s.errorMessage ?? s.errorType ?? 'unknown error'}`,
  )
  return `\n\n## Errors\n\n${items.join('\n')}`
}

function timelineSection(spans: Span[]): string {
  const events = buildConversation(spans)
  const lines: string[] = []
  let n = 1
  for (const e of events) {
    switch (e.kind) {
      case 'message':
        lines.push(`${n++}. ${e.role} ${e.role === 'user' ? '→ ' : ': '}${oneLine(e.content, 300)}`)
        break
      case 'tool_call':
        lines.push(`${n++}. ${e.toolName}(${oneLine(e.arguments, 200)})`)
        break
      case 'tool_result':
        lines.push(
          e.success
            ? `${n++}.   → ${oneLine(e.result, 300)}`
            : `${n++}.   → ERROR ${oneLine(e.error?.message ?? '', 200)}`,
        )
        break
      case 'agent_call':
        lines.push(`${n++}. ↳ ${e.agentName}(${oneLine(e.input, 150)}) → ${oneLine(e.result, 200)}`)
        break
    }
  }
  return lines.length ? `\n\n## Timeline\n\n${lines.join('\n')}` : ''
}

function finalSection(spans: Span[]): string {
  const events = buildConversation(spans)
  const last = [...events].reverse().find((e) => e.kind === 'message' && e.role === 'assistant')
  const text = last && last.kind === 'message' ? oneLine(last.content, 1000) : ''
  return `\n\n## Final message\n\n${text || '(no final assistant message)'}`
}

function renderTraceBrief(traceId: string, spans: Span[]): string {
  const agg = aggregate(spans)
  return header(`Run ${traceId}`, agg) + errorsSection(spans) + timelineSection(spans) + finalSection(spans)
}

function renderSessionBrief(sessionId: string, traceIds: string[], spans: Span[]): string {
  // Active compute time across turns, not wall-clock (which includes idle gaps).
  const byTrace = new Map<string, Span[]>()
  for (const s of spans) byTrace.set(s.traceId, [...(byTrace.get(s.traceId) ?? []), s])
  const activeMs = [...byTrace.values()].reduce((a, group) => a + aggregate(group).duration_ms, 0)
  const agg = { ...aggregate(spans), duration_ms: activeMs }
  const lineage = `\n\n## Traces\n\n${traceIds.map((id, i) => `${i + 1}. ${id}`).join('\n')}`
  return (
    header(`Session ${sessionId}`, agg) + lineage + errorsSection(spans) + timelineSection(spans) + finalSection(spans)
  )
}

export async function traceBriefResponse(traceId: string): Promise<Response> {
  const r = await getTrace(traceId)
  if (!r || r.spans.length === 0) return notFound(`Trace ${traceId}`)
  return markdown(renderTraceBrief(traceId, r.spans))
}

export async function sessionBriefResponse(sessionId: string): Promise<Response> {
  const r = await getSession(sessionId)
  if (!r || r.spans.length === 0) return notFound(`Session ${sessionId}`)
  return markdown(renderSessionBrief(r.sessionId, r.traceIds, r.spans))
}
