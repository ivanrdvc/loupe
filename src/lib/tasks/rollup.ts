import type { TraceCategory, TraceSummary } from '#/lib/telemetry'
import { type IdentitySource, taskIdentity } from './identity'

export const FIRE_CATEGORIES: ReadonlySet<TraceCategory> = new Set(['scheduled', 'event', 'webhook', 'background'])

export type TaskKind = 'cron' | 'one_shot' | 'event' | 'webhook' | 'background' | 'unknown'

export interface TaskRow {
  key: string
  identitySource: IdentitySource
  kind: TaskKind
  name?: string
  taskId?: string
  schedule?: string
  source?: string
  rootOperation?: string
  category: TraceCategory
  agent?: string
  serviceName?: string
  fires: number
  errored: number
  successRate: number
  avgDurationMs: number
  lastFireMs: number
  conversationId?: string // when all fires share one — surfaced as "Created by"
  spark: SparkPoint[]
  sampleTraceId: string
}

export interface SparkPoint {
  t: number
  fires: number
}

export interface RollupOpts {
  /** Number of buckets for the sparkline series. Default 16. */
  buckets?: number
  /** Window start in ms; defaults to min(startedAtMs) across input. */
  fromMs?: number
  /** Window end in ms; defaults to now. */
  toMs?: number
}

// Group fire traces by task identity. Returns one row per distinct task,
// sorted by fires desc. Input is the full trace list — this fn filters to
// fire categories itself so callers don't have to.
export function rollupTasks(traces: TraceSummary[], opts: RollupOpts = {}): TaskRow[] {
  const fires = traces.filter((t) => t.category && FIRE_CATEGORIES.has(t.category))
  if (fires.length === 0) return []

  const buckets = opts.buckets ?? 16
  const toMs = opts.toMs ?? Date.now()
  const fromMs = opts.fromMs ?? fires.reduce((m, t) => Math.min(m, t.startedAtMs), toMs)
  const span = Math.max(1, toMs - fromMs)
  const bucketMs = span / buckets

  const groups = new Map<string, TraceSummary[]>()
  const sources = new Map<string, IdentitySource>()
  for (const t of fires) {
    const { key, source } = taskIdentity(t)
    const arr = groups.get(key) ?? []
    arr.push(t)
    groups.set(key, arr)
    sources.set(key, source)
  }

  const rows: TaskRow[] = []
  for (const [key, group] of groups) {
    const sample = group[0]
    if (!sample) continue
    const errored = group.reduce((n, t) => n + (t.hasError ? 1 : 0), 0)
    const totalDur = group.reduce((n, t) => n + t.durationMs, 0)
    const lastFireMs = group.reduce((m, t) => Math.max(m, t.startedAtMs), 0)
    const spark: SparkPoint[] = Array.from({ length: buckets }, (_, i) => ({
      t: fromMs + i * bucketMs,
      fires: 0,
    }))
    for (const t of group) {
      const idx = Math.min(buckets - 1, Math.max(0, Math.floor((t.startedAtMs - fromMs) / bucketMs)))
      const point = spark[idx]
      if (point) point.fires += 1
    }
    const sharedConversation = group.every(
      (t) => t.sessionId && t.sessionId === sample.sessionId && t.sessionId !== t.id,
    )
      ? sample.sessionId
      : undefined

    rows.push({
      key,
      identitySource: sources.get(key) ?? 'derived',
      kind: deriveKind(sample),
      name: sample.taskName,
      taskId: sample.taskId,
      schedule: sample.taskSchedule,
      source: sample.taskSource,
      rootOperation: sample.rootOperation,
      category: sample.category ?? 'orphan',
      agent: sample.agent,
      serviceName: sample.serviceName,
      fires: group.length,
      errored,
      successRate: 1 - errored / group.length,
      avgDurationMs: Math.round(totalDur / group.length),
      lastFireMs,
      conversationId: sharedConversation,
      spark,
      sampleTraceId: sample.id,
    })
  }

  rows.sort((a, b) => b.fires - a.fires)
  return rows
}

function deriveKind(t: TraceSummary): TaskKind {
  const explicit = t.taskKind?.toLowerCase()
  if (
    explicit === 'cron' ||
    explicit === 'one_shot' ||
    explicit === 'event' ||
    explicit === 'webhook' ||
    explicit === 'background'
  ) {
    return explicit
  }
  switch (t.category) {
    case 'scheduled':
      return 'one_shot'
    case 'event':
      return 'event'
    case 'webhook':
      return 'webhook'
    case 'background':
      return 'background'
    default:
      return 'unknown'
  }
}

export interface RollupSummary {
  fires: number
  errored: number
  success: number
  successRate: number
  errorRate: number
  avgDurationMs: number
  taskCount: number
  healthyTasks: number
}

export function summarizeRollup(rows: TaskRow[]): RollupSummary {
  let fires = 0
  let errored = 0
  let weightedDur = 0
  let healthyTasks = 0
  for (const r of rows) {
    fires += r.fires
    errored += r.errored
    weightedDur += r.avgDurationMs * r.fires
    if (r.errored === 0) healthyTasks += 1
  }
  const success = fires - errored
  return {
    fires,
    errored,
    success,
    successRate: fires > 0 ? success / fires : 0,
    errorRate: fires > 0 ? errored / fires : 0,
    avgDurationMs: fires > 0 ? Math.round(weightedDur / fires) : 0,
    taskCount: rows.length,
    healthyTasks,
  }
}
