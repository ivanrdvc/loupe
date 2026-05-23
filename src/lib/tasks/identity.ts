import type { TraceSummary } from '#/lib/telemetry'

export type IdentitySource = 'task.id' | 'cloud-semconv' | 'derived'

export interface TaskIdentity {
  key: string
  source: IdentitySource
}

// Resolve a trace's task identity in priority order:
//   1. task.id — primary key, set by the app on the root span
//   2. Cloud OTel semconv on rootOperation — cloud.scheduler.job.name,
//      messaging.destination.name, http.route. agentops doesn't lift these
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
