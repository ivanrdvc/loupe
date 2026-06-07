// Shared evaluation types + display/aggregation helpers (see docs/plans/evaluation.md).
// One `Score` primitive (human/llm/code, disambiguated by `source`); these DTOs are the
// serialized (epoch-ms) shape returned by the server fns in src/server/scores.ts.
import type { JsonValue } from '#/lib/json'

export type ScoreDataType = 'numeric' | 'categorical' | 'boolean' | 'text'
export type ScoreTargetKind = 'span' | 'trace' | 'session'
export type ScoreSource = 'human' | 'llm' | 'code'

export const SCORE_DATA_TYPES: ScoreDataType[] = ['numeric', 'categorical', 'boolean', 'text']
export const SCORE_TARGET_KINDS: ScoreTargetKind[] = ['span', 'trace', 'session']

export type Score = {
  id: number
  targetKind: ScoreTargetKind
  targetId: string
  parentTraceId: string | null
  parentSessionId: string | null
  responseId: string | null
  name: string
  dataType: ScoreDataType
  value: number | null
  label: string | null
  explanation: string | null
  source: ScoreSource
  evaluator: string
  evaluatorVersion: number | null
  errorType: string | null
  runId: number | null
  definitionId: number | null
  datasetRunItemId: number | null
  // For session-scoped scores: whether targetId bound to a real session attribute
  // or fell back to a trace id.
  sessionSource: 'attribute' | 'trace' | null
  metadata: JsonValue | null
  createdAt: number
}

export type ScoreDirection = 'higher_better' | 'lower_better'

export type ScoreConfig = {
  id: number
  name: string
  dataType: ScoreDataType
  minValue: number | null
  maxValue: number | null
  categories: string[] | null
  passLabels: string[] | null // categorical: labels that count as passing
  failLabels: string[] | null // categorical: labels that count as failing
  direction: ScoreDirection // numeric: which end is "good"
  description: string | null
  archived: boolean
  createdAt: number
  updatedAt: number
}

export type UpsertScoreInput = {
  targetKind: ScoreTargetKind
  targetId: string
  parentTraceId?: string | null
  parentSessionId?: string | null
  responseId?: string | null
  name: string
  dataType: ScoreDataType
  value?: number | null
  label?: string | null
  explanation?: string | null
  evaluator: string
  datasetRunItemId?: number | null
  sessionSource?: 'attribute' | 'trace' | null
}

export type UpsertScoreConfigInput = {
  id?: number
  name: string
  dataType: ScoreDataType
  minValue?: number | null
  maxValue?: number | null
  categories?: string[] | null
  passLabels?: string[] | null
  failLabels?: string[] | null
  direction?: ScoreDirection | null
  description?: string | null
}

// One badge per target in the trace/session lists. The multi-author schema
// guarantees several scores per target, so the badge summarizes rather than
// showing a single dot.
export type ScoreSummary = {
  count: number // total score rows on the target
  names: string[] // distinct dimension names
  avg: number | null // mean of numeric/boolean values, when any
  badCount: number
  hasBad: boolean
  disagreement: boolean // a (name) carries both a human and an llm score that disagree
  tone: ScoreTone
  // When exactly one dimension is present, enough to render its raw value.
  single: { dataType: ScoreDataType; value: number | null; label: string | null } | null
}

export type ScoreTone = 'good' | 'warn' | 'bad' | 'neutral'

// Single state per target for the list score filter (worst-first priority).
export type ScoreFlag = 'unscored' | 'scored' | 'bad' | 'disagreement'
export function scoreFlagFor(summary: ScoreSummary | undefined): ScoreFlag {
  if (!summary) return 'unscored'
  if (summary.hasBad) return 'bad'
  if (summary.disagreement) return 'disagreement'
  return 'scored'
}

// All flags that apply to a target — lets the list "Score" filter match a "bad"
// item under both "Needs attention" and "Scored" without losing it to a single bucket.
export function scoreFlagsFor(summary: ScoreSummary | undefined): ScoreFlag[] {
  if (!summary) return ['unscored']
  const flags: ScoreFlag[] = []
  if (summary.hasBad) flags.push('bad')
  if (summary.disagreement) flags.push('disagreement')
  if (flags.length === 0) flags.push('scored')
  return flags
}

// evaluators (in-app runner)
export type EvalScope = ScoreTargetKind
export type EvalSourceKind = 'llm' | 'code'
export type EvalMode = 'offline' | 'online'
export type EvalStatus = 'active' | 'paused'
export type EvalRunStatus = 'pending' | 'running' | 'done' | 'error'

// Single source of truth for run-status badge color, so the eval-detail runs
// table and the run-detail header don't drift to different colors per status.
export const EVAL_RUN_STATUS_BADGE: Record<EvalRunStatus, 'default' | 'secondary' | 'success' | 'destructive'> = {
  pending: 'secondary',
  running: 'default',
  done: 'success',
  error: 'destructive',
}

export function isEvalRunActive(status?: EvalRunStatus): boolean {
  return status === 'pending' || status === 'running'
}

// Human hint for an errored run; null when the errors don't point at the judge
// (e.g. parse errors from a reachable provider).
export function judgeErrorHint(status: EvalRunStatus, errorTypes: (string | null)[]): string | null {
  if (status !== 'error') return null
  const types = errorTypes.filter((t): t is string => t != null)
  if (types.length === 0) {
    return 'The judge is not configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY and re-run.'
  }
  if (types.some((t) => t === 'network_error' || t === 'timeout' || t.startsWith('http_'))) {
    return 'The judge provider was unreachable or returned an error. Check your network and the provider key, then re-run.'
  }
  return null
}

export type EvalRunSummary = {
  total?: number
  done?: number
  pass?: number
  fail?: number
  errors?: number
  costUsd?: number
  model?: string
}

export type EvalDefinition = {
  id: number
  name: string
  scope: EvalScope
  dataType: ScoreDataType
  source: EvalSourceKind
  judgePrompt: string | null
  model: string
  targetFieldHints: JsonValue | null
  mode: EvalMode
  liveFilter: JsonValue | null
  status: EvalStatus
  version: number
  baselineRunId: number | null
  createdAt: number
  updatedAt: number
}

export type EvalRun = {
  id: number
  definitionId: number
  definitionVersion: number
  status: EvalRunStatus
  targetSelector: JsonValue | null
  blessed: boolean
  gitSha: string | null
  env: string | null
  startedAt: number | null
  endedAt: number | null
  summary: EvalRunSummary | null
  createdAt: number
}

export type UpsertEvalDefinitionInput = {
  id?: number
  name: string
  scope: EvalScope
  dataType: ScoreDataType
  source?: EvalSourceKind
  judgePrompt?: string | null
  model?: string
  mode?: EvalMode
  status?: EvalStatus
  liveFilter?: LiveFilter
}

// What an online evaluator watches: exact service/agent match + a sample rate.
// null means every recent trace at full rate.
export type LiveFilter = {
  sampleRate?: number
  serviceName?: string
  agentName?: string
} | null

// Per-dimension delta between a baseline run and a head run (regression view).
// `baseTotal`/`headTotal` are the counts of classifiable (non-errored) cases on
// each side — 0 means "no cases", distinct from a genuine 0% pass rate.
export type EvalCompareRow = {
  name: string
  baseAvg: number | null
  headAvg: number | null
  basePassRate: number
  headPassRate: number
  baseTotal: number
  headTotal: number
  flippedToFail: number // cases that passed in base, fail in head
  flippedToPass: number
}

// Lexicon fallback for categorical polarity, used only when a dimension's
// `score_config` defines no pass/fail sets. Also seeds the form's per-category default.
const BAD_LABELS = new Set(['incorrect', 'bad', 'fail', 'failed', 'no', 'negative', 'unhelpful', 'wrong', 'reject'])
const GOOD_LABELS = new Set(['correct', 'good', 'pass', 'passed', 'yes', 'positive', 'helpful', 'right', 'accept'])

export function defaultCategoryPolarity(label: string): 'good' | 'bad' | 'neutral' {
  const l = label.trim().toLowerCase()
  if (GOOD_LABELS.has(l)) return 'good'
  if (BAD_LABELS.has(l)) return 'bad'
  return 'neutral'
}

export type ScoreValueShape = Pick<Score, 'dataType' | 'value' | 'label'>
// The `score_config`-derived polarity/scale hints: pass/fail sets for categorical,
// range + direction for numeric. All optional — an unconfigured score is unclassified.
export type ConfigHint = {
  minValue?: number | null
  maxValue?: number | null
  passLabels?: string[] | null
  failLabels?: string[] | null
  direction?: 'higher_better' | 'lower_better' | null
}

function labelInSet(label: string, set?: string[] | null): boolean {
  if (!set?.length) return false
  const l = label.trim().toLowerCase()
  return set.some((c) => c.trim().toLowerCase() === l)
}

// Normalize a numeric score to a 0..1 fraction against its configured range.
// Returns null when the range is unknown — we don't guess the scale, so an
// unconfigured numeric score is left unclassified rather than mis-scored.
export function numericFraction(value: number, scale?: ConfigHint): number | null {
  if (scale?.maxValue == null) return null
  const min = scale.minValue ?? 0
  const max = scale.maxValue
  const span = max - min
  if (span <= 0) return value >= max ? 1 : 0
  return Math.min(1, Math.max(0, (value - min) / span))
}

export function scoreIsBad(s: ScoreValueShape, scale?: ConfigHint): boolean {
  if (s.dataType === 'boolean') return s.value === 0
  if (s.dataType === 'categorical') {
    if (s.label == null) return false
    // Config wins; if either set is configured, an unlisted label is neutral.
    if (labelInSet(s.label, scale?.failLabels)) return true
    if (scale?.passLabels?.length || scale?.failLabels?.length) return false
    return BAD_LABELS.has(s.label.trim().toLowerCase())
  }
  if (s.dataType === 'numeric' && s.value != null) {
    const f = numericFraction(s.value, scale)
    if (f == null) return false
    return scale?.direction === 'lower_better' ? f > 0.5 : f < 0.5
  }
  return false
}

export function scoreIsGood(s: ScoreValueShape, scale?: ConfigHint): boolean {
  if (s.dataType === 'boolean') return s.value === 1
  if (s.dataType === 'categorical') {
    if (s.label == null) return false
    if (labelInSet(s.label, scale?.passLabels)) return true
    if (scale?.passLabels?.length || scale?.failLabels?.length) return false
    return GOOD_LABELS.has(s.label.trim().toLowerCase())
  }
  if (s.dataType === 'numeric' && s.value != null) {
    const f = numericFraction(s.value, scale)
    if (f == null) return false
    return scale?.direction === 'lower_better' ? f <= 0.25 : f >= 0.75
  }
  return false
}

// Pass/fail for run summaries and rollups. null = unclassifiable (excluded from
// pass-rate, not counted as a pass): text, a categorical label of unknown polarity,
// or an unconfigured numeric score.
export function scorePassFail(s: ScoreValueShape, scale?: ConfigHint): 'pass' | 'fail' | null {
  if (scoreIsBad(s, scale)) return 'fail'
  if (s.dataType === 'text') return null
  if (s.dataType === 'categorical') return scoreIsGood(s, scale) ? 'pass' : null
  if (s.dataType === 'numeric') {
    // Unconfigured numeric (no known scale) is unclassifiable — not a pass.
    return s.value != null && numericFraction(s.value, scale) != null ? 'pass' : null
  }
  if (s.dataType === 'boolean') return scoreIsGood(s, scale) ? 'pass' : null
  return null
}

// Human-readable value, e.g. '✓ correct', '4/5', '0.82', '👍'.
export function formatScoreValue(s: ScoreValueShape, scale?: ConfigHint): string {
  switch (s.dataType) {
    case 'boolean':
      return s.value === 1 ? '👍' : s.value === 0 ? '👎' : '—'
    case 'categorical':
      return s.label ?? '—'
    case 'numeric': {
      if (s.value == null) return '—'
      const max = scale?.maxValue
      if (max != null && max > 1 && Number.isInteger(max)) return `${trimNum(s.value)}/${max}`
      return trimNum(s.value)
    }
    case 'text':
      return s.label ?? '—'
  }
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

// The polarity/scale hints a dimension's score_config carries, for classifying scores.
function configToHint(c: ScoreConfig): ConfigHint {
  return {
    minValue: c.minValue,
    maxValue: c.maxValue,
    passLabels: c.passLabels,
    failLabels: c.failLabels,
    direction: c.direction,
  }
}

export type ScoreDraftShape = { value: number | null; label: string | null }

// Whether an in-progress human score draft lands on the bad side of the dimension.
export function draftIsBad(config: ScoreConfig, draft: ScoreDraftShape): boolean {
  const scale = configToHint(config)
  if (config.dataType === 'boolean') {
    return scoreIsBad({ dataType: 'boolean', value: draft.value, label: null }, scale)
  }
  if (config.dataType === 'categorical') {
    return scoreIsBad({ dataType: 'categorical', value: null, label: draft.label }, scale)
  }
  if (config.dataType === 'numeric') {
    return scoreIsBad({ dataType: 'numeric', value: draft.value, label: null }, scale)
  }
  return false
}

export const SCORE_TONE_CLASS: Record<ScoreTone, string> = {
  good: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-destructive',
  neutral: 'text-muted-foreground',
}

// Background fills for tone dots (the text-color classes above don't show on a
// textless filled dot).
export const SCORE_TONE_DOT: Record<ScoreTone, string> = {
  good: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-destructive',
  neutral: 'bg-muted-foreground',
}

export const SCORE_SOURCE_ICON: Record<ScoreSource, string> = {
  human: '👤',
  llm: '🤖',
  code: '⚙️',
}

// Accessible label for a score's source — the emoji icon itself is decorative
// (aria-hidden), so pair it with this for screen readers / tooltips.
export const SCORE_SOURCE_LABEL: Record<ScoreSource, string> = {
  human: 'Human',
  llm: 'LLM judge',
  code: 'Code',
}

// Latest row per (name, evaluator) for run-less scores — what the list views show.
export function latestScores(scores: Score[]): Score[] {
  const byKey = new Map<string, Score>()
  for (const s of scores) {
    if (s.runId != null) continue // run-scoped scores live under their run, not the live badge
    const key = `${s.name}\u0000${s.evaluator}`
    const prev = byKey.get(key)
    if (!prev || s.createdAt > prev.createdAt) byKey.set(key, s)
  }
  return [...byKey.values()]
}

// Numeric scores are averaged only when their dimension has a configured range
// (numericFraction returns null otherwise) — an unconfigured numeric dimension
// has no known scale, so we leave it out of the average rather than guess.
export function summarizeScores(scores: Score[], configs?: Map<string, ConfigHint>): ScoreSummary | null {
  const latest = latestScores(scores)
  if (latest.length === 0) return null

  const names = [...new Set(latest.map((s) => s.name))]
  const scaleFor = (name: string) => configs?.get(name)

  let sum = 0
  let numCount = 0
  let badCount = 0
  for (const s of latest) {
    const scale = scaleFor(s.name)
    if (s.dataType === 'numeric' && s.value != null) {
      const f = numericFraction(s.value, scale)
      if (f != null) {
        sum += f
        numCount += 1
      }
    } else if (s.dataType === 'boolean' && s.value != null) {
      sum += s.value
      numCount += 1
    }
    if (scoreIsBad(s, scale)) badCount += 1
  }

  // Disagreement: a dimension carrying both a human and an llm score that land
  // on opposite sides of good/bad.
  let disagreement = false
  for (const name of names) {
    const human = latest.find((s) => s.name === name && s.source === 'human')
    const judge = latest.find((s) => s.name === name && s.source === 'llm')
    if (human && judge) {
      const scale = scaleFor(name)
      if (scoreIsBad(human, scale) !== scoreIsBad(judge, scale)) disagreement = true
    }
  }

  const hasBad = badCount > 0
  const tone: ScoreTone = hasBad ? 'bad' : disagreement ? 'warn' : numCount > 0 ? 'good' : 'neutral'

  return {
    count: latest.length,
    names,
    avg: numCount > 0 ? sum / numCount : null,
    badCount,
    hasBad,
    disagreement,
    tone,
    single:
      latest.length === 1 ? { dataType: latest[0].dataType, value: latest[0].value, label: latest[0].label } : null,
  }
}
