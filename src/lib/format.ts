export function formatAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000)
  if (s < 60) return `${Math.round(s)}s ago`
  const m = s / 60
  if (m < 60) return `${Math.round(m)}m ago`
  const h = m / 60
  if (h < 24) return `${Math.round(h)}h ago`
  return `${Math.round(h / 24)}d ago`
}

export function formatCost(usd: number): string {
  if (!usd) return '—'
  if (usd < 0.0001) return '<$0.0001'
  return `$${usd.toFixed(4)}`
}

export type MetricKind = 'cost' | 'tokens'

export function metricTone(
  kind: MetricKind,
  value: number | undefined,
  normal = 'text-zinc-950 dark:text-white',
): string {
  if (!value) return 'text-zinc-500 dark:text-zinc-400'
  if (kind === 'cost') {
    if (value >= 1) return 'text-rose-700 dark:text-rose-300'
    if (value >= 0.1) return 'text-amber-700 dark:text-amber-300'
  }
  if (kind === 'tokens') {
    if (value >= 1_000_000) return 'text-rose-700 dark:text-rose-300'
    if (value >= 250_000) return 'text-amber-700 dark:text-amber-300'
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

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
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
  const m = Math.floor(s / 60)
  const rs = Math.round(s % 60)
  return rs === 0 ? `${m}m` : `${m}m ${rs}s`
}
