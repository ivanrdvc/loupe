import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { db } from '#/db'
import { scoreConfigs, scores } from '#/db/schema'
import {
  type ConfigHint,
  numericFraction,
  SCORE_DATA_TYPES,
  SCORE_TARGET_KINDS,
  type Score,
  type ScoreConfig,
  type ScoreDataType,
  type ScoreSource,
  type ScoreSummary,
  type ScoreTargetKind,
  scorePassFail,
  summarizeScores,
  type UpsertScoreConfigInput,
  type UpsertScoreInput,
} from '#/lib/eval/evaluation'
import type { JsonValue } from '#/lib/json'

// coercion
function asDataType(value: unknown): ScoreDataType {
  if (typeof value !== 'string' || !SCORE_DATA_TYPES.includes(value as ScoreDataType)) {
    throw new Error(`Invalid score dataType: ${String(value)}`)
  }
  return value as ScoreDataType
}

function asTargetKind(value: unknown): ScoreTargetKind {
  if (typeof value !== 'string' || !SCORE_TARGET_KINDS.includes(value as ScoreTargetKind)) {
    throw new Error(`Invalid score targetKind: ${String(value)}`)
  }
  return value as ScoreTargetKind
}

function asOptString(value: unknown): string | null {
  if (value == null) return null
  const s = String(value).trim()
  return s.length > 0 ? s : null
}

function asOptNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function asOptInt(value: unknown): number | null {
  const n = asOptNumber(value)
  return n == null ? null : Math.trunc(n)
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function asRequiredString(value: unknown, label: string): string {
  const s = asOptString(value)
  if (!s) throw new Error(`${label} is required`)
  return s
}

function asOptionalDataType(value: unknown): ScoreDataType | undefined {
  if (value == null) return undefined
  return asDataType(value)
}

function asOptionalSource(value: unknown, label: string): ScoreSource | undefined {
  if (value == null) return undefined
  if (value === 'human' || value === 'llm' || value === 'code') return value
  throw new Error(`Invalid ${label}: ${String(value)}`)
}

function asOptionalTargetKind(value: unknown): ScoreTargetKind | undefined {
  if (value == null) return undefined
  return asTargetKind(value)
}

function asOptionalFiniteNumber(value: unknown, label: string): number | null | undefined {
  if (value == null || value === '') return value == null ? undefined : null
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`${label} must be a finite number`)
  return n
}

function asOptionalInt(value: unknown, label: string): number | null | undefined {
  const n = asOptionalFiniteNumber(value, label)
  return n == null ? n : Math.trunc(n)
}

// row → DTO
function toScore(row: typeof scores.$inferSelect): Score {
  return {
    id: row.id,
    targetKind: row.targetKind,
    targetId: row.targetId,
    parentTraceId: row.parentTraceId,
    parentSessionId: row.parentSessionId,
    responseId: row.responseId,
    name: row.name,
    dataType: row.dataType,
    value: row.value,
    label: row.label,
    explanation: row.explanation,
    source: row.source,
    evaluator: row.evaluator,
    evaluatorVersion: row.evaluatorVersion,
    errorType: row.errorType,
    runId: row.runId,
    definitionId: row.definitionId,
    promptVersionId: row.promptVersionId,
    datasetRunItemId: row.datasetRunItemId,
    sessionSource: row.sessionSource,
    metadata: (row.metadata ?? null) as JsonValue | null,
    createdAt: row.createdAt.getTime(),
  }
}

function toScoreConfig(row: typeof scoreConfigs.$inferSelect): ScoreConfig {
  return {
    id: row.id,
    name: row.name,
    dataType: row.dataType,
    minValue: row.minValue,
    maxValue: row.maxValue,
    categories: (row.categories ?? null) as string[] | null,
    passLabels: (row.passLabels ?? null) as string[] | null,
    failLabels: (row.failLabels ?? null) as string[] | null,
    direction: row.direction,
    description: row.description,
    archived: row.archived,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

// Trim + drop blanks from a label array input; null when not an array.
function asLabelList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const out = value.map((c) => String(c).trim()).filter((c) => c.length > 0)
  return out.length > 0 ? out : null
}

// Project a config row into the polarity/scale hint pass/fail aggregation reads.
export function configToHint(c: typeof scoreConfigs.$inferSelect): ConfigHint {
  return {
    minValue: c.minValue,
    maxValue: c.maxValue,
    passLabels: (c.passLabels ?? null) as string[] | null,
    failLabels: (c.failLabels ?? null) as string[] | null,
    direction: c.direction,
  }
}

// Per-dimension polarity/scale hints, keyed by name — the source of truth for
// pass/fail + numeric scale used by every aggregation (badges, rollup, compare).
export function scaleMap(configs: (typeof scoreConfigs.$inferSelect)[]): Map<string, ConfigHint> {
  return new Map(configs.map((c) => [c.name, configToHint(c)]))
}

// score_config (dimension registry)
export const listScoreConfigs = createServerFn({ method: 'GET' }).handler(async (): Promise<ScoreConfig[]> => {
  const rows = await db.select().from(scoreConfigs).orderBy(scoreConfigs.archived, scoreConfigs.name)
  return rows.map(toScoreConfig)
})

export const upsertScoreConfig = createServerFn({ method: 'POST' })
  .inputValidator((input: UpsertScoreConfigInput) => ({
    id: input.id == null ? null : Number(input.id),
    name: String(input.name).trim(),
    dataType: asDataType(input.dataType),
    minValue: asOptNumber(input.minValue),
    maxValue: asOptNumber(input.maxValue),
    // Trim/drop blanks so a `, ,`-style input can't persist an unscorable control.
    categories: asLabelList(input.categories),
    passLabels: asLabelList(input.passLabels),
    failLabels: asLabelList(input.failLabels),
    direction: input.direction === 'lower_better' ? ('lower_better' as const) : ('higher_better' as const),
    description: asOptString(input.description),
  }))
  .handler(async ({ data }): Promise<ScoreConfig> => {
    if (!data.name) throw new Error('Dimension name is required')
    // Server-side source of truth — these guards back up the form's validation.
    if (data.dataType === 'categorical' && (data.categories == null || data.categories.length === 0)) {
      throw new Error('A categorical dimension needs at least one category')
    }
    // Numeric scale is config-driven (no downstream guessing), so a range is required.
    if (data.dataType === 'numeric') {
      if (data.minValue == null || data.maxValue == null) {
        throw new Error('A numeric dimension needs both a min and a max value')
      }
      if (data.maxValue <= data.minValue) {
        throw new Error('A numeric dimension needs max greater than min')
      }
    }
    if (data.dataType === 'categorical') {
      const allowed = new Set((data.categories ?? []).map((c) => c.toLowerCase()))
      const stray = [...(data.passLabels ?? []), ...(data.failLabels ?? [])].find((l) => !allowed.has(l.toLowerCase()))
      if (stray) throw new Error(`Pass/fail label "${stray}" is not one of the categories`)
    }
    const now = new Date()
    // Null out fields that don't apply to this data type, so a type change leaves no stale polarity.
    const fields = {
      categories: data.dataType === 'categorical' ? data.categories : null,
      passLabels: data.dataType === 'categorical' ? data.passLabels : null,
      failLabels: data.dataType === 'categorical' ? data.failLabels : null,
      minValue: data.dataType === 'numeric' ? data.minValue : null,
      maxValue: data.dataType === 'numeric' ? data.maxValue : null,
      direction: data.direction,
    }
    if (data.id != null) {
      const [row] = await db
        .update(scoreConfigs)
        .set({
          name: data.name,
          dataType: data.dataType,
          ...fields,
          description: data.description,
          updatedAt: now,
        })
        .where(eq(scoreConfigs.id, data.id))
        .returning()
      if (!row) throw new Error('Score config not found')
      return toScoreConfig(row)
    }
    const [row] = await db
      .insert(scoreConfigs)
      .values({
        name: data.name,
        dataType: data.dataType,
        ...fields,
        description: data.description,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    if (!row) throw new Error('upsertScoreConfig: no row returned')
    return toScoreConfig(row)
  })

export const setScoreConfigArchived = createServerFn({ method: 'POST' })
  .inputValidator((input: { id: number; archived: boolean }) => ({
    id: Number(input.id),
    archived: Boolean(input.archived),
  }))
  .handler(async ({ data }): Promise<void> => {
    await db
      .update(scoreConfigs)
      .set({ archived: data.archived, updatedAt: new Date() })
      .where(eq(scoreConfigs.id, data.id))
  })

// scores
export const listScoresForTarget = createServerFn({ method: 'GET' })
  .inputValidator((input: { targetKind: ScoreTargetKind; targetId: string }) => ({
    targetKind: asTargetKind(input.targetKind),
    targetId: String(input.targetId),
  }))
  .handler(async ({ data }): Promise<Score[]> => {
    const rows = await db
      .select()
      .from(scores)
      .where(and(eq(scores.targetKind, data.targetKind), eq(scores.targetId, data.targetId)))
      .orderBy(desc(scores.createdAt))
    return rows.map(toScore)
  })

// Human inline scoring (Path A). Upserts the author's one current row for
// (target, name, evaluator) among run-less rows — never clobbering anyone
// else's row or a judge's. Enforced by the partial-unique index.
export const upsertHumanScore = createServerFn({ method: 'POST' })
  .inputValidator((input: UpsertScoreInput) => ({
    targetKind: asTargetKind(input.targetKind),
    targetId: String(input.targetId),
    parentTraceId: asOptString(input.parentTraceId),
    parentSessionId: asOptString(input.parentSessionId),
    responseId: asOptString(input.responseId),
    name: String(input.name).trim(),
    dataType: asDataType(input.dataType),
    value: asOptNumber(input.value),
    label: asOptString(input.label),
    explanation: asOptString(input.explanation),
    evaluator: String(input.evaluator).trim(),
    promptVersionId: asOptInt(input.promptVersionId),
    datasetRunItemId: asOptInt(input.datasetRunItemId),
    sessionSource: input.sessionSource === 'attribute' || input.sessionSource === 'trace' ? input.sessionSource : null,
  }))
  .handler(async ({ data }): Promise<Score> => {
    if (!data.name) throw new Error('Score dimension name is required')
    if (!data.evaluator) throw new Error('Score evaluator is required')
    // Human scores must reference a registered dimension (ingest stays lenient).
    const [cfg] = await db.select().from(scoreConfigs).where(eq(scoreConfigs.name, data.name)).limit(1)
    if (!cfg) throw new Error(`No score dimension named "${data.name}" — define it first`)
    const now = new Date()
    const [row] = await db
      .insert(scores)
      .values({
        targetKind: data.targetKind,
        targetId: data.targetId,
        parentTraceId: data.parentTraceId,
        parentSessionId: data.parentSessionId,
        responseId: data.responseId,
        name: data.name,
        dataType: data.dataType,
        value: data.value,
        label: data.label,
        explanation: data.explanation,
        source: 'human',
        evaluator: data.evaluator,
        sessionSource: data.sessionSource,
        promptVersionId: data.promptVersionId,
        datasetRunItemId: data.datasetRunItemId,
        createdAt: now,
      })
      // Partial-unique index binds WHERE run_id IS NULL — targetWhere must match
      // so SQLite recognizes the conflict target and updates instead of inserting.
      .onConflictDoUpdate({
        target: [scores.targetKind, scores.targetId, scores.name, scores.evaluator],
        targetWhere: sql`run_id IS NULL`,
        set: {
          dataType: data.dataType,
          value: data.value,
          label: data.label,
          explanation: data.explanation,
          sessionSource: data.sessionSource,
          promptVersionId: data.promptVersionId,
          datasetRunItemId: data.datasetRunItemId,
          createdAt: now,
        },
      })
      .returning()
    if (!row) throw new Error('upsertHumanScore: no row returned')
    return toScore(row)
  })

export const deleteScore = createServerFn({ method: 'POST' })
  .inputValidator((input: number | { id: number; evaluator?: string | null }) => {
    if (typeof input === 'number') return { id: Number(input), evaluator: null }
    return { id: Number(input.id), evaluator: asOptString(input.evaluator) }
  })
  .handler(async ({ data }): Promise<void> => {
    // Only human rows delete here (llm/code are immutable — re-run to replace).
    // No real auth: scope by the client's `evaluator` so you only delete your own row.
    const conds = [eq(scores.id, data.id), eq(scores.source, 'human')]
    if (data.evaluator) conds.push(eq(scores.evaluator, data.evaluator))
    await db.delete(scores).where(and(...conds))
  })

// list badges: aggregate per target across a kind
// Buckets span/trace/session scores under the id the relevant list keys on:
//  - trace list  → trace-level scores by targetId + span scores by parentTraceId
//  - session list→ session-level by targetId + span/trace scores by parentSessionId
//  - span list   → span-level scores by targetId
export const listScoreSummaries = createServerFn({ method: 'GET' })
  .inputValidator((input: { kind: ScoreTargetKind }) => ({ kind: asTargetKind(input.kind) }))
  .handler(async ({ data }): Promise<Record<string, ScoreSummary>> => {
    const rows = await db.select().from(scores)
    const configs = await db.select().from(scoreConfigs)
    const scaleByName = scaleMap(configs)

    const buckets = new Map<string, Score[]>()
    const push = (key: string | null, s: Score) => {
      if (!key) return
      const list = buckets.get(key)
      if (list) list.push(s)
      else buckets.set(key, [s])
    }
    for (const raw of rows) {
      const s = toScore(raw)
      if (data.kind === 'trace') {
        if (s.targetKind === 'trace') push(s.targetId, s)
        else if (s.targetKind === 'span') push(s.parentTraceId, s)
      } else if (data.kind === 'session') {
        if (s.targetKind === 'session') push(s.targetId, s)
        else push(s.parentSessionId, s)
      } else if (data.kind === 'span') {
        if (s.targetKind === 'span') push(s.targetId, s)
      }
    }

    const out: Record<string, ScoreSummary> = {}
    for (const [key, list] of buckets) {
      const summary = summarizeScores(list, scaleByName)
      if (summary) out[key] = summary
    }
    return out
  })

// /evals rollup: distribution per dimension
export type ScoreRollupRow = {
  name: string
  dataType: ScoreDataType
  total: number
  badCount: number
  passRate: number // 1 - badCount/total
  avg: number | null // mean of numeric/boolean values present
  bySource: Record<ScoreSource, number>
}

export const getScoreRollup = createServerFn({ method: 'GET' })
  .inputValidator((input: { sinceMs?: number }) => ({ sinceMs: asOptInt(input?.sinceMs) }))
  .handler(async ({ data }): Promise<ScoreRollupRow[]> => {
    // Live scores only — exclude offline run scores and dataset-judge scores.
    const runLess = and(isNull(scores.runId), isNull(scores.datasetRunItemId))
    const where = data.sinceMs ? and(runLess, gte(scores.createdAt, new Date(data.sinceMs))) : runLess
    const rows = await db.select().from(scores).where(where)
    const configs = await db.select().from(scoreConfigs)
    const scaleByName = scaleMap(configs)

    const byName = new Map<string, ScoreRollupRow & { _sum: number; _num: number; _pass: number; _fail: number }>()
    for (const raw of rows) {
      const s = toScore(raw)
      // Errored rows aren't passes — exclude so judge failures don't inflate pass rate.
      if (s.errorType != null) continue
      let agg = byName.get(s.name)
      if (!agg) {
        agg = {
          name: s.name,
          dataType: s.dataType,
          total: 0,
          badCount: 0,
          passRate: 0,
          avg: null,
          bySource: { human: 0, llm: 0, code: 0 },
          _sum: 0,
          _num: 0,
          _pass: 0,
          _fail: 0,
        }
        byName.set(s.name, agg)
      }
      agg.total += 1
      agg.bySource[s.source] += 1
      const scale = scaleByName.get(s.name)
      // Only classifiable scores count toward pass rate (excludes text/unknown-categorical).
      const pf = scorePassFail(s, scale)
      if (pf === 'fail') {
        agg.badCount += 1
        agg._fail += 1
      } else if (pf === 'pass') {
        agg._pass += 1
      }
      // Normalize to a 0..1 fraction so scales are comparable / match the badge avg.
      // Skip unconfigured numeric (no known scale) rather than guess.
      if (s.value != null && s.dataType === 'numeric') {
        const f = numericFraction(s.value, scale)
        if (f != null) {
          agg._sum += f
          agg._num += 1
        }
      } else if (s.value != null && s.dataType === 'boolean') {
        agg._sum += s.value
        agg._num += 1
      }
    }
    return [...byName.values()]
      .map(({ _sum, _num, _pass, _fail, ...row }) => ({
        ...row,
        passRate: _pass + _fail > 0 ? _pass / (_pass + _fail) : 0,
        avg: _num > 0 ? _sum / _num : null,
      }))
      .sort((a, b) => b.total - a.total)
  })

// Live result + cumulative cost per online evaluator, from its run-less scores
// (online evaluators write scores directly, never an eval_run). Feeds the /evals
// "Running Evaluators" Result + Cost columns.
export type OnlineEvalStat = { scored: number; pass: number; fail: number; passRate: number | null; costUsd: number }

function scoreCostUsd(metadata: JsonValue | null): number {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const c = (metadata as Record<string, JsonValue>).costUsd
    if (typeof c === 'number' && Number.isFinite(c)) return c
  }
  return 0
}

export const getOnlineEvalStats = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Record<number, OnlineEvalStat>> => {
    const rows = await db
      .select()
      .from(scores)
      .where(and(isNull(scores.runId), isNull(scores.datasetRunItemId), isNotNull(scores.definitionId)))
    const configs = await db.select().from(scoreConfigs)
    const scaleByName = scaleMap(configs)

    const byDef = new Map<number, { scored: number; pass: number; fail: number; costUsd: number }>()
    for (const raw of rows) {
      const s = toScore(raw)
      if (s.definitionId == null) continue
      let agg = byDef.get(s.definitionId)
      if (!agg) {
        agg = { scored: 0, pass: 0, fail: 0, costUsd: 0 }
        byDef.set(s.definitionId, agg)
      }
      agg.scored += 1
      agg.costUsd += scoreCostUsd(s.metadata)
      if (s.errorType != null) continue
      const pf = scorePassFail(s, scaleByName.get(s.name))
      if (pf === 'pass') agg.pass += 1
      else if (pf === 'fail') agg.fail += 1
    }

    const out: Record<number, OnlineEvalStat> = {}
    for (const [id, a] of byDef) {
      out[id] = { ...a, passRate: a.pass + a.fail > 0 ? a.pass / (a.pass + a.fail) : null }
    }
    return out
  },
)

// Path C: ingest gen_ai.evaluation.* events as score rows
// Append-only. `source` defaults to 'llm'. Used by POST /api/evals/ingest and
// the in-app judge runner. Each event maps one verdict → one score row.
export type IngestScoreEvent = {
  targetKind?: ScoreTargetKind
  targetId?: string
  responseId?: string
  parentTraceId?: string | null
  parentSessionId?: string | null
  name: string
  dataType?: ScoreDataType
  value?: number | null
  label?: string | null
  explanation?: string | null
  source?: ScoreSource
  evaluator: string
  errorType?: string | null
  runId?: number | null
  definitionId?: number | null
  promptVersionId?: number | null
  datasetRunItemId?: number | null
  metadata?: JsonValue | null
}

// Infer a dataType when an emitter omits it. A bare number is treated as
// numeric — we do NOT guess boolean from 0/1, since a numeric score of exactly
// 0 or 1 is common; emitters that mean boolean should send dataType explicitly.
function inferDataType(e: IngestScoreEvent): ScoreDataType {
  if (e.dataType && SCORE_DATA_TYPES.includes(e.dataType)) return e.dataType
  if (e.label != null && e.value == null) return 'categorical'
  if (typeof e.value === 'number') return 'numeric'
  return 'text'
}

export function parseIngestScoreEvents(input: unknown): IngestScoreEvent[] {
  const body = Array.isArray(input) ? { events: input } : asRecord(input, 'payload')
  const events = body.events
  if (!Array.isArray(events)) throw new Error('events must be an array')

  return events.map((raw, i) => {
    const label = `events[${i}]`
    const event = asRecord(raw, label)
    const targetId = asOptString(event.targetId)
    const responseId = asOptString(event.responseId)
    if (!targetId && !responseId) throw new Error(`${label}.targetId or ${label}.responseId is required`)

    return {
      targetKind: asOptionalTargetKind(event.targetKind),
      targetId: targetId ?? undefined,
      responseId: responseId ?? undefined,
      parentTraceId: asOptString(event.parentTraceId),
      parentSessionId: asOptString(event.parentSessionId),
      name: asRequiredString(event.name, `${label}.name`),
      dataType: asOptionalDataType(event.dataType),
      value: asOptionalFiniteNumber(event.value, `${label}.value`),
      label: asOptString(event.label),
      explanation: asOptString(event.explanation),
      source: asOptionalSource(event.source, `${label}.source`),
      evaluator: asRequiredString(event.evaluator, `${label}.evaluator`),
      errorType: asOptString(event.errorType),
      runId: asOptionalInt(event.runId, `${label}.runId`),
      definitionId: asOptionalInt(event.definitionId, `${label}.definitionId`),
      promptVersionId: asOptionalInt(event.promptVersionId, `${label}.promptVersionId`),
      datasetRunItemId: asOptionalInt(event.datasetRunItemId, `${label}.datasetRunItemId`),
      metadata: (event.metadata ?? null) as JsonValue | null,
    }
  })
}

export async function ingestScoreEvents(events: IngestScoreEvent[]): Promise<{ inserted: number }> {
  const now = new Date()
  const values: (typeof scores.$inferInsert)[] = []
  for (const e of events) {
    const targetId = asOptString(e.targetId) ?? asOptString(e.responseId)
    if (!targetId) continue // need something to attach to
    const name = asOptString(e.name)
    const evaluator = asOptString(e.evaluator)
    if (!name || !evaluator) continue
    const source: ScoreSource = e.source === 'human' || e.source === 'code' ? e.source : 'llm'
    values.push({
      targetKind: e.targetKind && SCORE_TARGET_KINDS.includes(e.targetKind) ? e.targetKind : 'trace',
      targetId,
      parentTraceId: asOptString(e.parentTraceId),
      parentSessionId: asOptString(e.parentSessionId),
      responseId: asOptString(e.responseId),
      name,
      dataType: inferDataType(e),
      value: asOptNumber(e.value),
      label: asOptString(e.label),
      explanation: asOptString(e.explanation),
      source,
      evaluator,
      errorType: asOptString(e.errorType),
      runId: asOptInt(e.runId),
      definitionId: asOptInt(e.definitionId),
      promptVersionId: asOptInt(e.promptVersionId),
      datasetRunItemId: asOptInt(e.datasetRunItemId),
      metadata: e.metadata ?? null,
      createdAt: now,
    })
  }
  if (values.length === 0) return { inserted: 0 }
  const { db: conn } = await import('#/db')
  await conn.insert(scores).values(values)
  return { inserted: values.length }
}

// Used by the run-detail page: per-case scores for one offline run.
export const listScoresByRun = createServerFn({ method: 'GET' })
  .inputValidator((runId: number) => Number(runId))
  .handler(async ({ data }): Promise<Score[]> => {
    const rows = await db.select().from(scores).where(eq(scores.runId, data)).orderBy(desc(scores.createdAt))
    return rows.map(toScore)
  })

// Every score an evaluator produced — online (run-less) and offline alike.
export const listScoresByDefinition = createServerFn({ method: 'GET' })
  .inputValidator((definitionId: number) => Number(definitionId))
  .handler(async ({ data }): Promise<Score[]> => {
    const rows = await db
      .select()
      .from(scores)
      .where(eq(scores.definitionId, data))
      .orderBy(desc(scores.createdAt))
      .limit(200)
    return rows.map(toScore)
  })

// Latest run-less scores for a set of run ids' definitions — used by compare.
export async function scoresForRuns(runIds: number[]): Promise<Score[]> {
  if (runIds.length === 0) return []
  const { db: conn } = await import('#/db')
  const rows = await conn.select().from(scores).where(inArray(scores.runId, runIds))
  return rows.map(toScore)
}
