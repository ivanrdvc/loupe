export const PRESETS = [1, 7, 14, 30] as const
export type TimeRange = number | { from: number; to: number }
export const DEFAULT: TimeRange = PRESETS[1]

export function windowMs(r: TimeRange): { from: number; to: number } {
  if (typeof r === 'number') {
    const to = Date.now()
    return { from: to - r * 86_400_000, to }
  }
  return r
}

export function windowUs(r: TimeRange): { fromUs: number; toUs: number } {
  const { from, to } = windowMs(r)
  return { fromUs: from * 1000, toUs: to * 1000 }
}

export const serialize = (r: TimeRange) => (typeof r === 'number' ? String(r) : `${r.from}-${r.to}`)

export function parse(v: unknown): TimeRange {
  let x: unknown = v
  if (typeof x === 'string' && x.startsWith('{')) {
    try {
      x = JSON.parse(x)
    } catch {
      /* leave as string */
    }
  }
  if (x && typeof x === 'object' && 'from' in x && 'to' in x) {
    const o = x as { from: unknown; to: unknown }
    if (typeof o.from === 'number' && typeof o.to === 'number' && o.from < o.to) {
      return { from: o.from, to: o.to }
    }
  }
  const n = Number(x)
  if ((PRESETS as readonly number[]).includes(n)) return n
  const m = String(x ?? '').match(/^(\d+)-(\d+)$/)
  if (m && +m[1] < +m[2]) return { from: +m[1], to: +m[2] }
  return DEFAULT
}

export function label(r: TimeRange) {
  if (typeof r === 'number') return r === 1 ? 'Past 1 day' : `Past ${r} days`
  const a = formatDayMonth(r.from)
  const b = formatDayMonth(r.to)
  return a === b ? a : `${a} – ${b}`
}

export const shortcut = (r: TimeRange) => (typeof r === 'number' ? `${r}d` : label(r))

export const formatDayMonth = (d: Date | number) =>
  (d instanceof Date ? d : new Date(d)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
