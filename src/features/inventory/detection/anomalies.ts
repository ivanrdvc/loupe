import { db } from '#/db'
import { inboxItems } from '#/db/schema'
import { CONTEXT_BUDGET_TOKENS } from '#/lib/format'
import { listTools, type ToolRow } from '#/lib/telemetry'

const MIN_PAYLOAD_CALLS = 3
const PAYLOAD_SPIKE_RATIO = 2

export interface AnomalyWindow {
  fromUs: number
  toUs: number
}

export async function runToolPayloadDetection(w: AnomalyWindow): Promise<{ fired: number }> {
  const span = w.toUs - w.fromUs
  const [current, prior] = await Promise.all([
    listTools({ fromUs: w.fromUs, toUs: w.toUs, limit: 50 }).catch(() => [] as ToolRow[]),
    listTools({ fromUs: w.fromUs - span, toUs: w.fromUs, limit: 50 }).catch(() => [] as ToolRow[]),
  ])
  const priorByName = new Map(prior.map((r) => [r.name, r]))
  const day = bucketDay(w.toUs)
  let fired = 0
  for (const cur of current) {
    if (cur.callsWithResult < MIN_PAYLOAD_CALLS) continue
    if (cur.p95TokensEst < CONTEXT_BUDGET_TOKENS) continue
    const prev = priorByName.get(cur.name)
    const isNew = !prev
    const isSpike = !!prev && cur.p95TokensEst >= prev.p95TokensEst * PAYLOAD_SPIKE_RATIO
    if (!isNew && !isSpike) continue
    const inserted = await db
      .insert(inboxItems)
      .values({
        kind: 'tool_size_p95',
        firedAt: new Date(),
        summary: payloadSummary(cur, prev),
        payloadJson: { current: cur, prior: prev ?? null },
        traceId: cur.sampleTraceId ?? null,
        dedupeKey: `tool_size_p95:${cur.name}:${day}`,
      })
      .onConflictDoNothing()
      .returning({ id: inboxItems.id })
    if (inserted.length > 0) fired += 1
  }
  return { fired }
}

function payloadSummary(cur: ToolRow, prev?: ToolRow): string {
  if (!prev) {
    return `${cur.name} p95 output ~${formatK(cur.p95TokensEst)} tokens — first observed over budget`
  }
  return `${cur.name} p95 output ~${formatK(cur.p95TokensEst)} tokens — was ~${formatK(prev.p95TokensEst)} prior window`
}

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function bucketDay(us: number): string {
  const d = new Date(Math.floor(us / 1000))
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}
