import { describe, expect, it } from 'vitest'
import type { DatasetRunItem, ItemScore } from '#/features/evaluation'
import { NO_FILTER, runFilterMatches, runItemDelta, runStatus, scoreVerdict } from './run-bits'

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

describe('runStatus', () => {
  it('maps a completed item to ok', () => {
    expect(runStatus(item({ status: 'ok' }))).toBe('ok')
  })

  it('maps a re-run/changed item to ok (still a successful execution)', () => {
    expect(runStatus(item({ status: 'changed' }))).toBe('ok')
  })

  it('maps an errored item to error', () => {
    expect(runStatus(errored)).toBe('error')
  })
})

describe('scoreVerdict', () => {
  it('returns fail when any score failed (fail wins over pass)', () => {
    expect(scoreVerdict(item({ scores: [score(true), score(false)] }))).toBe('fail')
  })

  it('returns pass when at least one passed and none failed', () => {
    expect(scoreVerdict(passing)).toBe('pass')
  })

  it('returns null for numeric-only scores (no boolean pass)', () => {
    expect(
      scoreVerdict(item({ scores: [{ name: 'sim', pass: null, value: 0.8, label: null, explanation: null }] })),
    ).toBe(null)
  })

  it('returns null when there are no scores', () => {
    expect(scoreVerdict(unjudged)).toBe(null)
  })
})

describe('runFilterMatches', () => {
  it('matches everything under NO_FILTER, including a missing item', () => {
    expect(runFilterMatches(NO_FILTER, passing)).toBe(true)
    expect(runFilterMatches(NO_FILTER, null)).toBe(true)
  })

  it('filters on status independently', () => {
    expect(runFilterMatches({ status: 'error', score: null }, errored)).toBe(true)
    expect(runFilterMatches({ status: 'error', score: null }, passing)).toBe(false)
    expect(runFilterMatches({ status: 'ok', score: null }, null)).toBe(false)
  })

  it('filters on score independently', () => {
    expect(runFilterMatches({ status: null, score: 'pass' }, passing)).toBe(true)
    expect(runFilterMatches({ status: null, score: 'fail' }, passing)).toBe(false)
    expect(runFilterMatches({ status: null, score: 'pass' }, null)).toBe(false)
  })

  it('requires both axes to match when both are set', () => {
    expect(runFilterMatches({ status: 'ok', score: 'pass' }, passing)).toBe(true)
    expect(runFilterMatches({ status: 'ok', score: 'fail' }, passing)).toBe(false)
  })
})

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

  it('flags ok→error as a regression even when the baseline was failing (status flip wins)', () => {
    expect(runItemDelta(failing, errored)).toBe('regressed')
    expect(runItemDelta(passing, errored)).toBe('regressed')
  })

  it('flags error→ok as an improvement regardless of the current verdict', () => {
    expect(runItemDelta(errored, passing)).toBe('improved')
    expect(runItemDelta(errored, failing)).toBe('improved')
    expect(runItemDelta(errored, unjudged)).toBe('improved')
  })

  it('treats same verdict as unchanged', () => {
    expect(runItemDelta(passing, passing)).toBe('unchanged')
    expect(runItemDelta(failing, failing)).toBe('unchanged')
    expect(runItemDelta(errored, errored)).toBe('unchanged')
    expect(runItemDelta(unjudged, unjudged)).toBe('unchanged')
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
