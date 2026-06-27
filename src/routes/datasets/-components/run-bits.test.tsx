import { describe, expect, it } from 'vitest'
import type { DatasetRunItem, ItemScore } from '#/features/evaluation'
import { runItemDelta } from './run-bits'

function item(over: Partial<DatasetRunItem> = {}): DatasetRunItem {
  return {
    runId: '1',
    exampleId: '1',
    output: 'out',
    status: 'ok',
    latencyMs: 0,
    tokens: 0,
    traceId: null,
    errorText: null,
    scores: [],
    ...over,
  }
}

const score = (pass: boolean): ItemScore => ({
  name: 'correctness',
  pass,
  value: pass ? 1 : 0,
  label: null,
  explanation: null,
})

const passing = item({ scores: [score(true)] })
const failing = item({ scores: [score(false)] })
const errored = item({ status: 'error', errorText: 'boom' })
const unjudged = item()

describe('runItemDelta', () => {
  it('flags PASS→FAIL as a regression', () => {
    expect(runItemDelta(passing, failing)).toBe('regressed')
  })

  it('flags FAIL→PASS as an improvement', () => {
    expect(runItemDelta(failing, passing)).toBe('improved')
  })

  it('flags ok→error as a regression even when the baseline was unjudged', () => {
    expect(runItemDelta(unjudged, errored)).toBe('regressed')
  })

  it('flags error→ok as an improvement', () => {
    expect(runItemDelta(errored, passing)).toBe('improved')
  })

  it('treats same verdict as unchanged', () => {
    expect(runItemDelta(passing, passing)).toBe('unchanged')
    expect(runItemDelta(failing, failing)).toBe('unchanged')
    expect(runItemDelta(errored, errored)).toBe('unchanged')
  })

  it('does not manufacture a regression from a pass↔unjudged shift', () => {
    expect(runItemDelta(passing, unjudged)).toBe('unchanged')
    expect(runItemDelta(unjudged, passing)).toBe('unchanged')
  })

  it('is unchanged when an item is missing from a run', () => {
    expect(runItemDelta(null, failing)).toBe('unchanged')
    expect(runItemDelta(passing, null)).toBe('unchanged')
  })
})
