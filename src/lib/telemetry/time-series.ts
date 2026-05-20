// Sparkline-bucket helpers shared by the OpenObserve and App Insights analytics
// modules. Each provider builds its own bucketed query and hands the resulting
// rows to `zeroFillBucketed` with a provider-specific `parseBucket` (since OO
// returns ISO strings or epoch numbers and AI returns ISO strings with optional
// `+` offsets and JS `Date` instances).

export const SPARK_BUCKETS = 24

// Split the user's window into ~SPARK_BUCKETS even slices. 60s floor avoids
// sub-second INTERVALs on tiny windows.
export function bucketSecondsFor(fromUs: number, toUs: number): number {
  const spanSec = Math.max(60, Math.floor((toUs - fromUs) / 1_000_000))
  return Math.max(60, Math.floor(spanSec / SPARK_BUCKETS))
}

export function buildSlots(fromUs: number, toUs: number, bucketSec: number): number[] {
  const bucketMs = bucketSec * 1000
  const startMs = Math.floor(fromUs / 1000)
  const endMs = Math.floor(toUs / 1000)
  const slots: number[] = []
  for (let t = startMs; t < endMs && slots.length < SPARK_BUCKETS; t += bucketMs) slots.push(t)
  return slots
}

// Map provider rows onto fixed time slots. Each slot gets either the row that
// lands on it exactly, or a row whose timestamp falls inside the slot's
// (bucketMs - 1) window, or a zero-filled value from `mapValue({})`.
export function zeroFillBucketed<R extends Record<string, unknown>, V>(
  rows: readonly R[],
  fromUs: number,
  toUs: number,
  bucketSec: number,
  parseBucket: (row: R) => number | undefined,
  mapValue: (row: R | Record<string, never>) => V,
): Array<{ ts: number; value: V }> {
  const slots = buildSlots(fromUs, toUs, bucketSec)
  if (slots.length === 0) return []
  const bucketMs = bucketSec * 1000
  const byTs = new Map<number, V>()
  for (const r of rows) {
    const ts = parseBucket(r)
    if (ts === undefined) continue
    byTs.set(ts, mapValue(r))
  }
  return slots.map((ts) => {
    if (byTs.has(ts)) return { ts, value: byTs.get(ts) as V }
    const lo = ts
    const hi = ts + bucketMs - 1
    for (const [k, v] of byTs) {
      if (k >= lo && k <= hi) return { ts, value: v }
    }
    return { ts, value: mapValue({}) }
  })
}
