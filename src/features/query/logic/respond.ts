import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { JsonValue } from '#/lib/json'

export const CLAMP = 400
// Inline ceiling before auto-dumping to a file (~chars). ~300 KB ≈ 75k tokens —
// big enough to not dump normal traces, small enough to never nuke an agent's
// context window. Bigger payloads return a path + summary instead.
const MAX_INLINE = 300_000

export type Detail = 'default' | 'full' | 'raw' | 'dump'

export function readDetail(url: URL): Detail {
  const d = url.searchParams.get('detail')
  return d === 'full' || d === 'raw' || d === 'dump' ? d : 'default'
}

/** Parse `limit`/`offset` paging params, clamped. */
export function readPage(p: URLSearchParams, defLimit: number, maxLimit = 100): { limit: number; offset: number } {
  const limit = Math.min(Math.max(Number.parseInt(p.get('limit') ?? String(defLimit), 10) || defLimit, 1), maxLimit)
  const offset = Math.max(Number.parseInt(p.get('offset') ?? '0', 10) || 0, 0)
  return { limit, offset }
}

export const pageMeta = (total: number, limit: number, offset: number) => ({
  total,
  limit,
  offset,
  has_more: offset + limit < total,
})

const DAY_MS = 86_400_000
const UNIT_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: DAY_MS, w: 604_800_000 }

/** `since` accepts `24h`, `7d`, `90m`, `2w`, or a bare number (days). */
export function parseSince(raw: string | null, fallbackDays = 1): { fromUs: number; toUs: number; label: string } {
  const to = Date.now()
  const m = raw?.trim().match(/^(\d+(?:\.\d+)?)\s*([smhdw]?)$/i)
  const span = m ? Number.parseFloat(m[1]) * (UNIT_MS[m[2].toLowerCase()] ?? DAY_MS) : fallbackDays * DAY_MS
  return { fromUs: (to - span) * 1000, toUs: to * 1000, label: m ? `${m[1]}${m[2] || 'd'}` : `${fallbackDays}d` }
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...init?.headers },
  })
}

export function markdown(text: string, init?: ResponseInit): Response {
  return new Response(text, {
    ...init,
    headers: { 'content-type': 'text/markdown; charset=utf-8', ...init?.headers },
  })
}

export const notFound = (what: string) => json({ error: `${what} not found` }, { status: 404 })
export const badRequest = (msg: string) => json({ error: msg }, { status: 400 })

/** Clamp a string to `limit` chars, appending a marker with the dropped count. */
export function clampText(s: string, limit = CLAMP): string {
  return s.length <= limit ? s : `${s.slice(0, limit)} [+${s.length - limit} chars truncated]`
}

/**
 * Context guard for tool/LLM I/O. Strings are clamped; objects pass through
 * untouched when small, else collapse to a clamped JSON string. `full` disables.
 */
export function clampIO(value: JsonValue | undefined, detail: Detail, limit = CLAMP): JsonValue | undefined {
  if (value == null || detail === 'full') return value
  if (typeof value === 'string') return clampText(value, limit)
  const s = JSON.stringify(value)
  return s.length <= limit ? value : clampText(s, limit)
}

/** Write the full payload to a temp file; return the path instead of inlining. */
function fileDump(label: string, data: unknown): { dumped: true; path: string; bytes: number } {
  const body = JSON.stringify(data, null, 2)
  // Sanitize: label is URL-derived (trace/span/session id); a decoded `%2F`
  // would otherwise let `join` traverse out of tmpdir on a read-only API.
  const safe = label.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
  const path = join(tmpdir(), `loupe-${safe}-${Date.now()}.json`)
  writeFileSync(path, body)
  return { dumped: true, path, bytes: Buffer.byteLength(body) }
}

/**
 * JSON response with the file-dump escape hatch: `?detail=dump` forces a dump,
 * and any payload over the inline cap dumps automatically. `summary` is echoed
 * alongside the path so the agent still gets a cheap orientation.
 */
export function respond(data: unknown, detail: Detail, label: string, summary?: unknown): Response {
  const body = JSON.stringify(data)
  if (detail === 'dump' || body.length > MAX_INLINE) {
    return json({ ...fileDump(label, data), summary })
  }
  return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8' } })
}
