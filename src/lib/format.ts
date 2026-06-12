import { ACCENT } from '#/lib/tone'

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function formatAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return `${Math.round(s)}s ago`
  const m = s / 60
  if (m < 60) return `${Math.round(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.round(h)}h ago`
  return `${Math.round(h / 24)}d ago`
}

// Like formatAgo but renders future timestamps as "in 5m" instead of clamping.
export function formatRelative(ms: number): string {
  const diff = ms - Date.now()
  if (Math.abs(diff) < 5_000) return 'now'
  const absS = Math.abs(diff) / 1000
  const suffix = diff < 0 ? ' ago' : ''
  const prefix = diff < 0 ? '' : 'in '
  if (absS < 60) return `${prefix}${Math.round(absS)}s${suffix}`
  const m = absS / 60
  if (m < 60) return `${prefix}${Math.round(m)}m${suffix}`
  const h = m / 60
  if (h < 24) return `${prefix}${Math.round(h)}h${suffix}`
  return `${prefix}${Math.round(h / 24)}d${suffix}`
}

export function shortId(id: string, cutoff = 16): string {
  return id.length > cutoff ? `${id.slice(0, Math.max(4, cutoff - 6))}…${id.slice(-4)}` : id
}

export function formatCost(usd: number): string {
  if (!usd) return '—'
  if (usd < 0.0001) return '<$0.0001'
  return `$${usd.toFixed(4)}`
}

export type MetricKind = 'cost' | 'tokens' | 'duration'

export function metricTone(
  kind: MetricKind,
  value: number | undefined,
  normal = 'text-zinc-950 dark:text-white',
): string {
  if (!value) return ACCENT.zinc.text
  if (kind === 'cost') {
    if (value >= 1) return ACCENT.rose.status
    if (value >= 0.1) return ACCENT.amber.status
  }
  if (kind === 'tokens') {
    if (value >= 1_000_000) return ACCENT.rose.status
    if (value >= 250_000) return ACCENT.amber.status
  }
  if (kind === 'duration') {
    if (value >= 3_600_000) return ACCENT.rose.status
    if (value >= 600_000) return ACCENT.amber.status
  }
  return normal
}

export function formatTokens(tokens: number | undefined): string {
  if (!tokens) return '—'
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 10_000) return `${Math.round(tokens / 1000)}k`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return tokens.toLocaleString()
}

export function tokensFromChars(chars: number): number {
  return Math.ceil(chars / 4)
}

export function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}

export function formatPercent(num: number, denom: number, digits = 1): string {
  if (!denom || !Number.isFinite(num) || !Number.isFinite(denom)) return '—'
  return `${((num / denom) * 100).toFixed(digits)}%`
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const totalM = Math.floor(s / 60)
  if (totalM < 60) {
    const rs = Math.round(s % 60)
    return rs === 0 ? `${totalM}m` : `${totalM}m ${rs}s`
  }
  const h = Math.floor(totalM / 60)
  const rm = totalM % 60
  return rm === 0 ? `${h}h` : `${h}h ${rm}m`
}
