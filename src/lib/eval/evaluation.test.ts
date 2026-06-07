import { describe, expect, it } from 'vitest'
import {
  defaultCategoryPolarity,
  formatScoreValue,
  judgeErrorHint,
  numericFraction,
  type Score,
  type ScoreDataType,
  type ScoreSummary,
  scoreFlagFor,
  scoreIsBad,
  scoreIsGood,
  scorePassFail,
  summarizeScores,
} from './evaluation'

let nextId = 1
function score(partial: Partial<Score> & { dataType: ScoreDataType }): Score {
  return {
    id: nextId++,
    targetKind: 'span',
    targetId: 't1',
    parentTraceId: null,
    parentSessionId: null,
    responseId: null,
    name: 'quality',
    value: null,
    label: null,
    explanation: null,
    source: 'human',
    evaluator: 'alice',
    evaluatorVersion: null,
    errorType: null,
    runId: null,
    definitionId: null,
    datasetRunItemId: null,
    sessionSource: null,
    metadata: null,
    createdAt: 1000,
    ...partial,
  }
}

describe('numericFraction', () => {
  it('normalizes against the configured range', () => {
    expect(numericFraction(4, { minValue: 1, maxValue: 5 })).toBeCloseTo(0.75)
    expect(numericFraction(1, { minValue: 1, maxValue: 5 })).toBe(0)
    expect(numericFraction(5, { minValue: 1, maxValue: 5 })).toBe(1)
  })

  it('clamps out-of-range values to 0..1', () => {
    expect(numericFraction(10, { minValue: 0, maxValue: 5 })).toBe(1)
    expect(numericFraction(-3, { minValue: 0, maxValue: 5 })).toBe(0)
  })

  it('returns null when the range is unknown — no scale-guessing', () => {
    expect(numericFraction(0.8)).toBeNull()
    expect(numericFraction(4)).toBeNull()
    expect(numericFraction(4, { minValue: 1 })).toBeNull() // max missing → unknown scale
  })

  it('handles a degenerate (zero-span) range', () => {
    expect(numericFraction(5, { minValue: 5, maxValue: 5 })).toBe(1)
    expect(numericFraction(4, { minValue: 5, maxValue: 5 })).toBe(0)
  })
})

describe('config-driven polarity', () => {
  it('classifies categorical labels by the config pass/fail sets, not the lexicon', () => {
    const cfg = { passLabels: ['Acceptable'], failLabels: ['Rejected'] }
    expect(scoreIsGood({ dataType: 'categorical', value: null, label: 'acceptable' }, cfg)).toBe(true)
    expect(scoreIsBad({ dataType: 'categorical', value: null, label: 'rejected' }, cfg)).toBe(true)
  })

  it('treats a label outside the configured sets as neutral (does not fall back to the lexicon)', () => {
    const cfg = { passLabels: ['acceptable'], failLabels: ['rejected'] }
    // 'correct' is a lexicon GOOD_LABEL, but the config is the source of truth here.
    expect(scoreIsGood({ dataType: 'categorical', value: null, label: 'correct' }, cfg)).toBe(false)
    expect(scorePassFail({ dataType: 'categorical', value: null, label: 'correct' }, cfg)).toBeNull()
  })

  it('falls back to the lexicon only when no polarity is configured', () => {
    expect(scoreIsGood({ dataType: 'categorical', value: null, label: 'correct' })).toBe(true)
    expect(scoreIsBad({ dataType: 'categorical', value: null, label: 'incorrect' })).toBe(true)
  })

  it('inverts numeric polarity for lower_better dimensions', () => {
    const lower = { minValue: 0, maxValue: 1, direction: 'lower_better' as const }
    // 0.1 is a low (good) value when lower is better.
    expect(scoreIsGood({ dataType: 'numeric', value: 0.1, label: null }, lower)).toBe(true)
    expect(scoreIsBad({ dataType: 'numeric', value: 0.9, label: null }, lower)).toBe(true)
    expect(scorePassFail({ dataType: 'numeric', value: 0.9, label: null }, lower)).toBe('fail')
  })

  it('leaves an unconfigured numeric score unclassified (not a silent pass)', () => {
    expect(scorePassFail({ dataType: 'numeric', value: 7, label: null })).toBeNull()
    expect(scoreIsBad({ dataType: 'numeric', value: 7, label: null })).toBe(false)
  })
})

describe('scoreIsBad / scoreIsGood', () => {
  it('classifies boolean by value', () => {
    expect(scoreIsBad({ dataType: 'boolean', value: 0, label: null })).toBe(true)
    expect(scoreIsGood({ dataType: 'boolean', value: 1, label: null })).toBe(true)
  })

  it('classifies known categorical labels via the word sets', () => {
    expect(scoreIsBad({ dataType: 'categorical', value: null, label: 'Incorrect' })).toBe(true)
    expect(scoreIsGood({ dataType: 'categorical', value: null, label: 'correct' })).toBe(true)
  })

  it('treats unknown categorical labels as neither good nor bad', () => {
    const s = { dataType: 'categorical' as const, value: null, label: 'mediocre' }
    expect(scoreIsBad(s)).toBe(false)
    expect(scoreIsGood(s)).toBe(false)
  })
})

describe('scorePassFail', () => {
  it('returns null for text — no pass/fail meaning', () => {
    expect(scorePassFail({ dataType: 'text', value: null, label: 'a summary' })).toBeNull()
  })

  it('returns null for categorical labels of unknown polarity', () => {
    expect(scorePassFail({ dataType: 'categorical', value: null, label: 'mediocre' })).toBeNull()
  })

  it('classifies known categorical labels', () => {
    expect(scorePassFail({ dataType: 'categorical', value: null, label: 'fail' })).toBe('fail')
    expect(scorePassFail({ dataType: 'categorical', value: null, label: 'pass' })).toBe('pass')
  })

  it('classifies boolean and numeric, excluding null-valued numeric', () => {
    expect(scorePassFail({ dataType: 'boolean', value: 0, label: null })).toBe('fail')
    expect(scorePassFail({ dataType: 'boolean', value: 1, label: null })).toBe('pass')
    expect(scorePassFail({ dataType: 'boolean', value: 0.5, label: null })).toBeNull()
    expect(scorePassFail({ dataType: 'boolean', value: null, label: null })).toBeNull()
    expect(scorePassFail({ dataType: 'numeric', value: 4, label: null }, { minValue: 1, maxValue: 5 })).toBe('pass')
    expect(scorePassFail({ dataType: 'numeric', value: 1, label: null }, { minValue: 1, maxValue: 5 })).toBe('fail')
    expect(scorePassFail({ dataType: 'numeric', value: null, label: null })).toBeNull()
  })
})

describe('summarizeScores', () => {
  it('averages numeric scores as a normalized 0..1 fraction', () => {
    const configs = new Map([['quality', { minValue: 1, maxValue: 5 }]])
    const summary = summarizeScores([score({ dataType: 'numeric', value: 4 })], configs)
    expect(summary?.avg).toBeCloseTo(0.75)
  })

  it('flags disagreement when a human and llm land on opposite sides', () => {
    const scores = [
      score({ dataType: 'boolean', value: 1, source: 'human', evaluator: 'alice' }),
      score({ dataType: 'boolean', value: 0, source: 'llm', evaluator: 'judge:gpt' }),
    ]
    const summary = summarizeScores(scores)
    expect(summary?.disagreement).toBe(true)
  })

  it('keeps only the latest run-less row per (name, evaluator)', () => {
    const scores = [
      score({ dataType: 'boolean', value: 1, evaluator: 'alice', createdAt: 1000 }),
      score({ dataType: 'boolean', value: 0, evaluator: 'alice', createdAt: 2000 }),
    ]
    const summary = summarizeScores(scores)
    expect(summary?.count).toBe(1)
    expect(summary?.hasBad).toBe(true) // the newer (value 0) row wins
  })
})

describe('judgeErrorHint', () => {
  it('returns null for non-errored runs', () => {
    expect(judgeErrorHint('done', ['network_error'])).toBeNull()
    expect(judgeErrorHint('running', [])).toBeNull()
  })

  it('hints "not configured" when an errored run has no per-case rows', () => {
    expect(judgeErrorHint('error', [])).toMatch(/not configured/i)
    expect(judgeErrorHint('error', [null, null])).toMatch(/not configured/i)
  })

  it('hints "unreachable" for network/timeout/http_* case errors', () => {
    expect(judgeErrorHint('error', ['network_error'])).toMatch(/unreachable/i)
    expect(judgeErrorHint('error', ['timeout'])).toMatch(/unreachable/i)
    expect(judgeErrorHint('error', ['http_500'])).toMatch(/unreachable/i)
  })

  it('returns null when the errors are not endpoint-related (e.g. parse errors)', () => {
    expect(judgeErrorHint('error', ['parse_error'])).toBeNull()
  })
})

describe('defaultCategoryPolarity', () => {
  it('maps lexicon good/bad words and treats the rest as neutral', () => {
    expect(defaultCategoryPolarity('correct')).toBe('good')
    expect(defaultCategoryPolarity('INCORRECT')).toBe('bad')
    expect(defaultCategoryPolarity('  Pass ')).toBe('good')
    expect(defaultCategoryPolarity('mediocre')).toBe('neutral')
  })
})

describe('formatScoreValue', () => {
  it('renders boolean as a thumb, with an em dash for null', () => {
    expect(formatScoreValue({ dataType: 'boolean', value: 1, label: null })).toBe('👍')
    expect(formatScoreValue({ dataType: 'boolean', value: 0, label: null })).toBe('👎')
    expect(formatScoreValue({ dataType: 'boolean', value: null, label: null })).toBe('—')
  })

  it('renders a numeric value as n/max when an integer range is configured', () => {
    expect(formatScoreValue({ dataType: 'numeric', value: 4, label: null }, { minValue: 1, maxValue: 5 })).toBe('4/5')
  })

  it('renders a bare trimmed number when no integer max is configured', () => {
    expect(formatScoreValue({ dataType: 'numeric', value: 0.82, label: null })).toBe('0.82')
  })

  it('renders categorical/text by label, em dash when absent', () => {
    expect(formatScoreValue({ dataType: 'categorical', value: null, label: 'correct' })).toBe('correct')
    expect(formatScoreValue({ dataType: 'text', value: null, label: null })).toBe('—')
  })
})

describe('scoreFlagFor', () => {
  const summary = (s: Partial<ScoreSummary>): ScoreSummary => ({
    count: 1,
    names: ['quality'],
    avg: null,
    badCount: 0,
    hasBad: false,
    disagreement: false,
    tone: 'neutral',
    single: null,
    ...s,
  })

  it('prioritizes unscored → bad → disagreement → scored', () => {
    expect(scoreFlagFor(undefined)).toBe('unscored')
    expect(scoreFlagFor(summary({ hasBad: true, disagreement: true }))).toBe('bad')
    expect(scoreFlagFor(summary({ disagreement: true }))).toBe('disagreement')
    expect(scoreFlagFor(summary({}))).toBe('scored')
  })
})
