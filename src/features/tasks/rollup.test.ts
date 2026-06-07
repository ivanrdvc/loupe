import { describe, expect, it } from 'vitest'
import type { TraceSummary } from '#/lib/telemetry'
import { rollupTasks, summarizeRollup } from './rollup'

function trace(over: Partial<TraceSummary> & { id: string; startedAtMs: number }): TraceSummary {
  return {
    spanCount: 1,
    durationMs: 100,
    category: 'scheduled',
    ...over,
  }
}

describe('rollupTasks', () => {
  it('groups fires by task.id', () => {
    const traces = [
      trace({ id: 'a', startedAtMs: 1000, taskId: 'job-x', category: 'scheduled' }),
      trace({ id: 'b', startedAtMs: 2000, taskId: 'job-x', category: 'scheduled', hasError: true }),
      trace({ id: 'c', startedAtMs: 3000, taskId: 'job-y', category: 'scheduled' }),
    ]
    const rows = rollupTasks(traces, { fromMs: 0, toMs: 4000 })
    expect(rows).toHaveLength(2)
    const x = rows.find((r) => r.taskId === 'job-x')
    expect(x?.fires).toBe(2)
    expect(x?.errored).toBe(1)
    expect(x?.successRate).toBe(0.5)
    expect(x?.identitySource).toBe('task.id')
  })

  it('filters non-fire categories out', () => {
    const traces = [
      trace({ id: 'a', startedAtMs: 1, taskId: 'job', category: 'scheduled' }),
      trace({ id: 'b', startedAtMs: 2, category: 'chat' }),
    ]
    const rows = rollupTasks(traces, { fromMs: 0, toMs: 100 })
    expect(rows).toHaveLength(1)
  })

  it('falls back to derived identity when no task.id', () => {
    const traces = [
      trace({ id: 'a', startedAtMs: 1, serviceName: 'agent-run-test', agent: 'Proverbs', category: 'event' }),
      trace({ id: 'b', startedAtMs: 2, serviceName: 'agent-run-test', agent: 'Proverbs', category: 'event' }),
    ]
    const rows = rollupTasks(traces, { fromMs: 0, toMs: 100 })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.identitySource).toBe('derived')
    expect(rows[0]?.fires).toBe(2)
  })

  it('sorts by fires desc', () => {
    const traces = [
      trace({ id: '1', startedAtMs: 1, taskId: 'a', category: 'scheduled' }),
      trace({ id: '2', startedAtMs: 2, taskId: 'b', category: 'scheduled' }),
      trace({ id: '3', startedAtMs: 3, taskId: 'b', category: 'scheduled' }),
      trace({ id: '4', startedAtMs: 4, taskId: 'b', category: 'scheduled' }),
    ]
    const rows = rollupTasks(traces, { fromMs: 0, toMs: 100 })
    expect(rows[0]?.taskId).toBe('b')
    expect(rows[0]?.fires).toBe(3)
  })

  it('builds sparkline buckets', () => {
    const traces = [
      trace({ id: '1', startedAtMs: 100, taskId: 'a' }),
      trace({ id: '2', startedAtMs: 200, taskId: 'a' }),
      trace({ id: '3', startedAtMs: 800, taskId: 'a' }),
    ]
    const rows = rollupTasks(traces, { fromMs: 0, toMs: 1000, buckets: 10 })
    const spark = rows[0]?.spark ?? []
    expect(spark).toHaveLength(10)
    expect(spark.reduce((n, p) => n + p.fires, 0)).toBe(3)
  })
})

describe('summarizeRollup', () => {
  it('aggregates rows into totals', () => {
    const traces = [
      trace({ id: '1', startedAtMs: 1, taskId: 'a', durationMs: 100 }),
      trace({ id: '2', startedAtMs: 2, taskId: 'a', durationMs: 200, hasError: true }),
      trace({ id: '3', startedAtMs: 3, taskId: 'b', durationMs: 50 }),
    ]
    const rows = rollupTasks(traces, { fromMs: 0, toMs: 100 })
    const s = summarizeRollup(rows)
    expect(s.fires).toBe(3)
    expect(s.errored).toBe(1)
    expect(s.success).toBe(2)
    expect(s.taskCount).toBe(2)
    expect(s.errorRate).toBeCloseTo(1 / 3)
    expect(s.successRate).toBeCloseTo(2 / 3)
    // task 'a' has 1 error → not healthy; task 'b' is clean → healthy
    expect(s.healthyTasks).toBe(1)
  })

  it('returns zeros on empty input', () => {
    const s = summarizeRollup([])
    expect(s).toEqual({
      fires: 0,
      errored: 0,
      success: 0,
      successRate: 0,
      errorRate: 0,
      avgDurationMs: 0,
      taskCount: 0,
      healthyTasks: 0,
    })
  })
})
