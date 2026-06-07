import { db } from '#/db'
import { inboxItems } from '#/db/schema'
import { tokensFromChars } from '#/lib/format'
import { listToolPayloadSizes, type ToolPayloadRow } from '#/lib/telemetry'

// Noise-floor thresholds. Payload spikes on rare tools are meaningless until
// there are enough calls to draw a line under.
const MIN_PAYLOAD_CHARS = 1000
const MIN_PAYLOAD_CALLS = 3
const PAYLOAD_SPIKE_RATIO = 2

export interface AnomalyWindow {
  fromUs: number
  toUs: number
}

export async function runToolPayloadDetection(w: AnomalyWindow): Promise<{ fired: number }> {
  const span = w.toUs - w.fromUs
  const [current, prior] = await Promise.all([
    listToolPayloadSizes({ fromUs: w.fromUs, toUs: w.toUs, limit: 50 }).catch(() => [] as ToolPayloadRow[]),
    listToolPayloadSizes({ fromUs: w.fromUs - span, toUs: w.fromUs, limit: 50 }).catch(() => [] as ToolPayloadRow[]),
  ])
  const priorByName = new Map(prior.map((r) => [r.name, r]))
  const day = bucketDay(w.toUs)
  let fired = 0
  for (const cur of current) {
    if (cur.count < MIN_PAYLOAD_CALLS) continue
    if (cur.p95Chars < MIN_PAYLOAD_CHARS) continue
    const prev = priorByName.get(cur.name)
    const isNew = !prev
    const isSpike = !!prev && cur.p95Chars >= prev.p95Chars * PAYLOAD_SPIKE_RATIO
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

function payloadSummary(cur: ToolPayloadRow, prev?: ToolPayloadRow): string {
  const tokens = tokensFromChars(cur.p95Chars)
  if (!prev) {
    return `${cur.name} p95 output ~${formatK(tokens)} tokens (${formatK(cur.p95Chars)} chars) — first observed at this size`
  }
  const prevTokens = tokensFromChars(prev.p95Chars)
  return `${cur.name} p95 output ~${formatK(tokens)} tokens — was ~${formatK(prevTokens)} prior window`
}

function formatK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function bucketDay(us: number): string {
  const d = new Date(Math.floor(us / 1000))
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}
