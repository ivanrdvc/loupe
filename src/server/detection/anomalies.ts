import { db } from '#/db'
import { inboxItems } from '#/db/schema'
import { listToolErrorRates, listToolPayloadSizes, type ToolErrorRow, type ToolPayloadRow } from '#/lib/telemetry'

// Noise-floor thresholds. A 1/1 = 100% error rate is meaningless until there
// are enough calls to draw a line under; same for payload spikes on rare tools.
const MIN_ERRORS = 3
const MIN_ERROR_RATE = 0.05
const ERROR_SPIKE_RATIO = 2

const MIN_PAYLOAD_CHARS = 1000
const MIN_PAYLOAD_CALLS = 3
const PAYLOAD_SPIKE_RATIO = 2

export interface AnomalyWindow {
  fromUs: number
  toUs: number
}

export async function runToolErrorRateDetection(w: AnomalyWindow): Promise<{ fired: number }> {
  const span = w.toUs - w.fromUs
  const [current, prior] = await Promise.all([
    listToolErrorRates({ fromUs: w.fromUs, toUs: w.toUs, limit: 50 }).catch(() => [] as ToolErrorRow[]),
    listToolErrorRates({ fromUs: w.fromUs - span, toUs: w.fromUs, limit: 50 }).catch(() => [] as ToolErrorRow[]),
  ])
  const priorByName = new Map(prior.map((r) => [r.name, r]))
  const day = bucketDay(w.toUs)
  let fired = 0
  for (const cur of current) {
    if (cur.errors < MIN_ERRORS) continue
    if (cur.errorRate < MIN_ERROR_RATE) continue
    const prev = priorByName.get(cur.name)
    const isNew = !prev || prev.errors === 0
    const isSpike = !!prev && prev.errorRate > 0 && cur.errorRate >= prev.errorRate * ERROR_SPIKE_RATIO
    if (!isNew && !isSpike) continue
    const inserted = await db
      .insert(inboxItems)
      .values({
        kind: 'tool_error_rate',
        firedAt: new Date(),
        summary: errorSummary(cur, prev),
        payloadJson: { current: cur, prior: prev ?? null },
        traceId: cur.lastErrorTraceId ?? null,
        dedupeKey: `tool_error_rate:${cur.name}:${day}`,
      })
      .onConflictDoNothing()
      .returning({ id: inboxItems.id })
    if (inserted.length > 0) fired += 1
  }
  return { fired }
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

function errorSummary(cur: ToolErrorRow, prev?: ToolErrorRow): string {
  const pct = (cur.errorRate * 100).toFixed(1)
  if (!prev || prev.errors === 0) {
    return `${cur.name} errored ${cur.errors}/${cur.total} (${pct}%) — no prior failures`
  }
  const prevPct = (prev.errorRate * 100).toFixed(1)
  return `${cur.name} errored ${cur.errors}/${cur.total} (${pct}%) — was ${prevPct}% prior window`
}

function payloadSummary(cur: ToolPayloadRow, prev?: ToolPayloadRow): string {
  const tokens = Math.ceil(cur.p95Chars / 4)
  if (!prev) {
    return `${cur.name} p95 output ~${formatK(tokens)} tokens (${formatK(cur.p95Chars)} chars) — first observed at this size`
  }
  const prevTokens = Math.ceil(prev.p95Chars / 4)
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
