import type { ToolPayloadPoint } from '#/lib/telemetry'

export type TrendDirection = 'growing' | 'flat' | 'shrinking'

export interface PayloadTrend {
  direction: TrendDirection
  ratio: number // late-window p95 ÷ early-window p95
}

const GROW = 1.5
const SHRINK = 0.67

// A tool whose per-call result keeps growing across the window is scaling with
// its data (list-shaped) — the capacity risk. Flat means bounded.
export function classifyPayloadTrend(points: ToolPayloadPoint[]): PayloadTrend {
  const active = points.filter((p) => p.calls > 0 && p.p95TokensEst > 0)
  if (active.length < 2) return { direction: 'flat', ratio: 1 }
  const mid = Math.floor(active.length / 2)
  const early = avg(active.slice(0, mid).map((p) => p.p95TokensEst))
  const late = avg(active.slice(mid).map((p) => p.p95TokensEst))
  if (early === 0) return { direction: 'flat', ratio: 1 }
  const ratio = late / early
  const direction: TrendDirection = ratio >= GROW ? 'growing' : ratio <= SHRINK ? 'shrinking' : 'flat'
  return { direction, ratio }
}

function avg(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length
}
