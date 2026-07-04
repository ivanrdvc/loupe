import { describe, expect, it } from 'vitest'
import type { TraceSummary } from '#/lib/telemetry'
import { fixtureTaskKey } from '#/lib/telemetry/fixtures'
import { taskIdentity } from './rollup'

// The detail page used to re-filter fetched fires with `taskIdentity(t).key ===
// taskKey` because the JS identity and the provider's taskKey filter might drift.
// That guard is gone; this pins the two JS mirrors together (taskIdentity ↔ the
// fixtures provider's fixtureTaskKey, which stands in for the SQL taskKeyWhere).
// If they diverge, the server-filtered fires would no longer match the row.
const base: TraceSummary = { id: 't', startedAtMs: 0, durationMs: 0, spanCount: 1 }

const CASES: Array<[string, TraceSummary]> = [
  ['task.id wins', { ...base, taskId: 'nightly-report', rootOperation: 'process queueitem', serviceName: 's' }],
  ['cloud-semconv root operation', { ...base, rootOperation: 'process queueitem', serviceName: 's', agent: 'A' }],
  ['derived triple', { ...base, serviceName: 'report-svc', agent: 'ReportBot', category: 'scheduled' }],
  ['agent-name root falls through to derived', { ...base, rootOperation: 'invoke_agent Foo', category: 'event' }],
  ['execute_tool root falls through to derived', { ...base, rootOperation: 'execute_tool x', category: 'webhook' }],
  // '|' in service/agent must survive: the key is compared whole, never split
  // back into segments (taskKeyWhere rebuilds CH_DERIVED_KEY, fixtureTaskKey the
  // string) — a split decode would fold 'b' into the agent match here.
  ['pipe in service and agent', { ...base, serviceName: 'a|b', agent: 'x|y', category: 'scheduled' }],
  ['nothing set → orphan derived', base],
]

describe('taskIdentity ↔ fixtureTaskKey parity', () => {
  it.each(CASES)('%s', (_label, trace) => {
    expect(fixtureTaskKey(trace)).toBe(taskIdentity(trace).key)
  })
})
