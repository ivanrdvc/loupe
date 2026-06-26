import { describe, expect, it } from 'vitest'
import type { RollupSummary } from '#/features/tasks/rollup'
import { formatDuration, formatPercent } from '#/lib/format'
import { buildTiles } from './metric-tiles'

function summary(overrides: Partial<RollupSummary> = {}): RollupSummary {
  const base: RollupSummary = {
    fires: 100,
    errored: 0,
    success: 100,
    successRate: 1,
    errorRate: 0,
    avgDurationMs: 1500,
    taskCount: 4,
    healthyTasks: 4,
    pausedTasks: 0,
    neverRunTasks: 0,
  }
  return { ...base, ...overrides }
}

describe('buildTiles', () => {
  it('returns the deduped tile labels', () => {
    const tiles = buildTiles(summary())
    expect(tiles).toHaveLength(4)
    expect(tiles.map((t) => t.label)).toEqual(['Error-free fires', 'Healthy tasks', 'Avg duration', 'Cost'])
  })

  it('cost tile shows em-dash when cost is unknown', () => {
    expect(buildTiles(summary({ totalCostUsd: undefined }))[3].value).toBe('—')
  })

  it('drops the legacy Success rate / Errored fires labels', () => {
    const labels = buildTiles(summary()).map((t) => t.label)
    expect(labels).not.toContain('Success rate')
    expect(labels).not.toContain('Errored fires')
  })

  it('error-free value is formatPercent(success, fires)', () => {
    const s = summary({ fires: 200, success: 197, errored: 3 })
    const tile = buildTiles(s)[0]
    expect(tile.value).toBe(formatPercent(s.success, s.fires))
  })

  it('error-free caption shows fires only when errored is 0', () => {
    const tile = buildTiles(summary({ fires: 1234, success: 1234, errored: 0 }))[0]
    expect(tile.caption).toBe('1,234/1,234 fires')
  })

  it('error-free caption appends errored count when errored > 0', () => {
    const tile = buildTiles(summary({ fires: 1234, success: 1200, errored: 34 }))[0]
    expect(tile.caption).toBe('1,200/1,234 fires · 34 errored')
  })

  it('healthy tasks caption shows healthy/taskCount tasks', () => {
    const tile = buildTiles(summary({ healthyTasks: 3, taskCount: 5 }))[1]
    expect(tile.caption).toBe('3/5 tasks')
  })

  it('avg duration uses formatDuration and is muted', () => {
    const s = summary({ avgDurationMs: 1500 })
    const tile = buildTiles(s)[2]
    expect(tile.value).toBe(formatDuration(1500))
    expect(tile.tone).toBe('muted')
  })

  it('avg duration shows em-dash when there are no fires', () => {
    const tile = buildTiles(summary({ fires: 0, success: 0, avgDurationMs: 0 }))[2]
    expect(tile.value).toBe('—')
  })

  it('error-free tone is emerald at 100%', () => {
    expect(buildTiles(summary({ fires: 100, success: 100, errored: 0 }))[0].tone).toBe('emerald')
  })

  it('error-free tone drops to amber below the 0.99 green threshold', () => {
    expect(buildTiles(summary({ fires: 100, success: 97, errored: 3 }))[0].tone).toBe('amber')
  })

  it('error-free tone drops to rose below the 0.95 amber threshold', () => {
    expect(buildTiles(summary({ fires: 100, success: 90, errored: 10 }))[0].tone).toBe('rose')
  })

  it('a zero-fires summary yields a muted error-free tile with em-dash and empty caption', () => {
    const tile = buildTiles(summary({ fires: 0, success: 0, errored: 0 }))[0]
    expect(tile.tone).toBe('muted')
    expect(tile.value).toBe('—')
    expect(tile.caption).toBe('')
  })
})
