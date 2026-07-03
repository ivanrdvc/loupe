import type { TaskRollupRow, TraceCategory, TraceSummary } from '#/lib/telemetry'
import { FIRE_TRIGGER_TYPES } from '#/lib/telemetry/trace-category'
import type { DeclaredTask } from './declared'
import { triggerNextDueMs } from './declared'

const FIRE_CATEGORIES: ReadonlySet<TraceCategory> = new Set(FIRE_TRIGGER_TYPES)

type IdentitySource = 'task.id' | 'cloud-semconv' | 'derived'

export interface TaskIdentity {
  key: string
  source: IdentitySource
}

// Resolve a trace's task identity in priority order:
//   1. task.id — primary key, set by the app on the root span
//   2. Cloud OTel semconv on rootOperation — cloud.scheduler.job.name,
//      messaging.destination.name, http.route. loupe doesn't lift these
//      into TraceSummary today; the rootOperation field already carries the
//      span name, which is what OO/AI emit for these (e.g. KEDA produces
//      `process queueitem`). Treated as the same family for grouping.
//   3. Derived (service.name, gen_ai.agent.name, trigger_type) — lossy.
//
// Source is returned so the UI can flag derived rows.
export function taskIdentity(t: TraceSummary): TaskIdentity {
  if (t.taskId) return { key: `task:${t.taskId}`, source: 'task.id' }
  if (t.rootOperation) {
    const op = t.rootOperation.trim()
    if (op && !op.startsWith('invoke_agent') && !op.startsWith('execute_tool') && !op.startsWith('chat')) {
      return { key: `op:${op}`, source: 'cloud-semconv' }
    }
  }
  const parts = [t.serviceName ?? '', t.agent ?? '', t.category ?? 'orphan']
  return { key: `derived:${parts.join('|')}`, source: 'derived' }
}

export type TaskKind = 'cron' | 'one_shot' | 'event' | 'webhook' | 'unknown'

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
  costUsd?: number // undefined when no fire carried usage (thin spans) — not $0
  conversationId?: string // when all fires share one — surfaced as "Created by"
  spark: SparkPoint[]
  sampleTraceId: string
  declared?: DeclaredTask // registry overlay; fed fork-side, never by core
}

export type TaskState = 'paused' | 'archived' | 'never-run' | 'failing' | 'healthy'

// Status and fires are independent — a paused task may still have window fires.
export function taskState(r: TaskRow): TaskState {
  const s = r.declared?.status
  if (s === 'paused') return 'paused'
  if (s === 'archived') return 'archived'
  const ranEver = r.fires > 0 || (r.declared?.lifetime?.totalRuns ?? 0) > 0
  if (r.declared && !ranEver) return 'never-run'
  return r.errored > 0 ? 'failing' : 'healthy'
}

export function taskNextDueMs(r: TaskRow): number | undefined {
  if (r.declared && r.declared.status !== 'active') return undefined
  return triggerNextDueMs(r.declared?.trigger)
}

interface SparkPoint {
  t: number
  fires: number
}

function buildSpark(timestampsMs: readonly number[], fromMs: number, toMs: number, buckets: number): SparkPoint[] {
  const bucketMs = Math.max(1, toMs - fromMs) / buckets
  const spark: SparkPoint[] = Array.from({ length: buckets }, (_, i) => ({ t: fromMs + i * bucketMs, fires: 0 }))
  for (const ts of timestampsMs) {
    const point = spark[Math.min(buckets - 1, Math.max(0, Math.floor((ts - fromMs) / bucketMs)))]
    if (point) point.fires += 1
  }
  return spark
}

function identitySourceFromKey(key: string): IdentitySource {
  if (key.startsWith('task:')) return 'task.id'
  if (key.startsWith('op:')) return 'cloud-semconv'
  return 'derived'
}

interface RollupOpts {
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

  const groups = new Map<string, TraceSummary[]>()
  for (const t of fires) {
    const { key } = taskIdentity(t)
    const arr = groups.get(key) ?? []
    arr.push(t)
    groups.set(key, arr)
  }

  const rows: TaskRow[] = []
  for (const [key, group] of groups) {
    const sample = group[0]
    if (!sample) continue
    const errored = group.reduce((n, t) => n + (t.hasError ? 1 : 0), 0)
    const totalDur = group.reduce((n, t) => n + t.durationMs, 0)
    const lastFireMs = group.reduce((m, t) => Math.max(m, t.startedAtMs), 0)
    let costUsd = 0
    let hasCost = false
    for (const t of group)
      if (t.totalCostUsd != null) {
        costUsd += t.totalCostUsd
        hasCost = true
      }
    const spark = buildSpark(
      group.map((t) => t.startedAtMs),
      fromMs,
      toMs,
      buckets,
    )
    const sharedConversation = group.every(
      (t) => t.sessionId && t.sessionId === sample.sessionId && t.sessionId !== t.id,
    )
      ? sample.sessionId
      : undefined

    rows.push({
      key,
      identitySource: taskIdentity(sample).source,
      kind: deriveKind(sample.taskKind, sample.category ?? 'orphan'),
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
      costUsd: hasCost ? costUsd : undefined,
      conversationId: sharedConversation,
      spark,
      sampleTraceId: sample.id,
    })
  }

  rows.sort((a, b) => b.fires - a.fires)
  return rows
}

function deriveKind(taskKind: string | undefined, category: TraceCategory): TaskKind {
  const explicit = taskKind?.toLowerCase()
  if (explicit === 'cron' || explicit === 'one_shot' || explicit === 'event' || explicit === 'webhook') {
    return explicit
  }
  switch (category) {
    case 'scheduled':
      return 'one_shot'
    case 'event':
      return 'event'
    case 'webhook':
      return 'webhook'
    default:
      return 'unknown'
  }
}

// SQL-grouped task aggregates → TaskRow[]; the JS side only adds spark buckets,
// kind, and identity source. Same shape as rollupTasks.
export function tasksFromRollupRows(rows: readonly TaskRollupRow[], opts: RollupOpts = {}): TaskRow[] {
  const buckets = opts.buckets ?? 16
  const toMs = opts.toMs ?? Date.now()
  const fromMs = opts.fromMs ?? rows.reduce((m, r) => r.fireTimestampsMs.reduce((mm, t) => Math.min(mm, t), m), toMs)
  return rows
    .map(
      (r): TaskRow => ({
        key: r.key,
        identitySource: identitySourceFromKey(r.key),
        kind: deriveKind(r.taskKind, r.category),
        name: r.taskName,
        taskId: r.taskId,
        schedule: r.taskSchedule,
        source: r.taskSource,
        rootOperation: r.rootOperation,
        category: r.category,
        agent: r.agent,
        serviceName: r.serviceName,
        fires: r.fires,
        errored: r.errored,
        successRate: r.fires > 0 ? 1 - r.errored / r.fires : 0,
        avgDurationMs: r.avgDurationMs,
        lastFireMs: r.lastFireMs,
        costUsd: r.costUsd,
        conversationId: r.conversationId,
        spark: buildSpark(r.fireTimestampsMs, fromMs, toMs, buckets),
        sampleTraceId: r.sampleTraceId,
      }),
    )
    .sort((a, b) => b.fires - a.fires)
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
  totalCostUsd?: number
  pausedTasks: number // declared-aware — non-zero only with a registry overlay
  neverRunTasks: number
}

export function summarizeRollup(rows: TaskRow[]): RollupSummary {
  let fires = 0
  let errored = 0
  let weightedDur = 0
  let healthyTasks = 0
  let cost = 0
  let hasCost = false
  let pausedTasks = 0
  let neverRunTasks = 0
  for (const r of rows) {
    fires += r.fires
    errored += r.errored
    weightedDur += r.avgDurationMs * r.fires
    if (r.fires > 0 && r.errored === 0) healthyTasks += 1
    if (r.costUsd != null) {
      cost += r.costUsd
      hasCost = true
    }
    const state = taskState(r)
    if (state === 'paused') pausedTasks += 1
    else if (state === 'never-run') neverRunTasks += 1
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
    totalCostUsd: hasCost ? cost : undefined,
    pausedTasks,
    neverRunTasks,
  }
}
