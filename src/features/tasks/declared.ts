// Registry overlay shape — what a task IS, independent of telemetry. Populated by
// a fork-side adapter, never by core.

export interface EventFilter {
  field: string
  value: string
}

export type TaskTrigger =
  | { kind: 'cron'; expr: string; timezone?: string; nextDueMs?: number }
  | { kind: 'one_shot'; dueMs?: number }
  | { kind: 'event'; eventType: string; filters: EventFilter[] }
  | { kind: 'webhook'; source?: string }

export interface TaskLifetime {
  totalRuns: number
  succeededRuns: number
  lastRunStatus?: string
  lastRunError?: string | null
  lastRunAtMs?: number
}

export interface DeclaredTask {
  id: string
  name?: string
  status: 'active' | 'paused' | 'archived'
  trigger?: TaskTrigger
  owner?: { userId?: string; tenantId?: string }
  originThreadId?: string
  createdAtMs?: number
  updatedAtMs?: number
  lifetime?: TaskLifetime
}

const shortField = (f: string): string => f.split('.').pop() ?? f

export function formatTrigger(t: TaskTrigger | undefined): { primary: string; detail?: string } | null {
  if (!t) return null
  switch (t.kind) {
    case 'cron':
      return { primary: t.expr, detail: t.timezone }
    case 'one_shot':
      return { primary: 'one-time' }
    case 'event':
      return {
        primary: t.eventType,
        detail: t.filters.length ? t.filters.map((f) => `${shortField(f.field)}=${f.value}`).join(', ') : undefined,
      }
    case 'webhook':
      return { primary: t.source ?? 'webhook' }
  }
}

export function triggerNextDueMs(t: TaskTrigger | undefined): number | undefined {
  if (t?.kind === 'cron') return t.nextDueMs
  if (t?.kind === 'one_shot') return t.dueMs
  return undefined
}
