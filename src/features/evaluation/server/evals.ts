import { createServerFn } from '@tanstack/react-start'
import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '#/db'
import { evalDefinitions, evalRuns, scoreConfigs, scores } from '#/db/schema'
import { DEFAULT_JUDGE_MODEL } from '#/features/evaluation/logic/models'
import {
  type EvalCompareRow,
  type EvalDefinition,
  type EvalMode,
  type EvalRun,
  type EvalRunSummary,
  type EvalScope,
  type EvalStatus,
  SCORE_DATA_TYPES,
  SCORE_TARGET_KINDS,
  type ScoreDataType,
  type ScoreTargetKind,
  scoreIsBad,
  type UpsertEvalDefinitionInput,
} from '#/lib/eval/evaluation'
import type { JsonValue } from '#/lib/json'
import { resolveJudgeDefaults } from './judge'
import { parseLiveFilter } from './online-eval-filter'
import { scaleMap } from './scores'

function asScope(v: unknown): EvalScope {
  if (typeof v === 'string' && SCORE_TARGET_KINDS.includes(v as ScoreTargetKind)) return v as EvalScope
  return 'trace'
}
function asDataType(v: unknown): ScoreDataType {
  if (typeof v === 'string' && SCORE_DATA_TYPES.includes(v as ScoreDataType)) return v as ScoreDataType
  throw new Error(`Invalid eval dataType: ${String(v)}`)
}
function asMode(v: unknown): EvalMode {
  return v === 'online' ? 'online' : 'offline'
}
function asStatus(v: unknown): EvalStatus {
  return v === 'paused' ? 'paused' : 'active'
}
function asOptString(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s.length > 0 ? s : null
}

function toDefinition(row: typeof evalDefinitions.$inferSelect): EvalDefinition {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    dataType: row.dataType,
    source: row.source,
    judgePrompt: row.judgePrompt,
    model: row.model,
    targetFieldHints: (row.targetFieldHints ?? null) as JsonValue | null,
    mode: row.mode,
    liveFilter: (row.liveFilter ?? null) as JsonValue | null,
    status: row.status,
    version: row.version,
    baselineRunId: row.baselineRunId,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  }
}

function toRun(row: typeof evalRuns.$inferSelect): EvalRun {
  return {
    id: row.id,
    definitionId: row.definitionId,
    definitionVersion: row.definitionVersion,
    status: row.status,
    targetSelector: (row.targetSelector ?? null) as JsonValue | null,
    blessed: row.blessed,
    gitSha: row.gitSha,
    env: row.env,
    startedAt: row.startedAt ? row.startedAt.getTime() : null,
    endedAt: row.endedAt ? row.endedAt.getTime() : null,
    summary: (row.summary ?? null) as EvalRunSummary | null,
    createdAt: row.createdAt.getTime(),
  }
}

export const listEvalDefinitions = createServerFn({ method: 'GET' })
  .inputValidator((input?: { mode?: EvalMode }) => ({
    mode: input?.mode === 'online' || input?.mode === 'offline' ? input.mode : null,
  }))
  .handler(async ({ data }): Promise<EvalDefinition[]> => {
    const rows = data.mode
      ? await db
          .select()
          .from(evalDefinitions)
          .where(eq(evalDefinitions.mode, data.mode))
          .orderBy(desc(evalDefinitions.updatedAt))
      : await db.select().from(evalDefinitions).orderBy(desc(evalDefinitions.updatedAt))
    return rows.map(toDefinition)
  })

export type EvalDefinitionDetail = { definition: EvalDefinition; runs: EvalRun[] }

export const getEvalDefinition = createServerFn({ method: 'GET' })
  .inputValidator((id: number) => Number(id))
  .handler(async ({ data }): Promise<EvalDefinitionDetail | null> => {
    const [row] = await db.select().from(evalDefinitions).where(eq(evalDefinitions.id, data)).limit(1)
    if (!row) return null
    const runRows = await db
      .select()
      .from(evalRuns)
      .where(eq(evalRuns.definitionId, data))
      .orderBy(desc(evalRuns.createdAt))
    return { definition: toDefinition(row), runs: runRows.map(toRun) }
  })

export const upsertEvalDefinition = createServerFn({ method: 'POST' })
  .inputValidator((input: UpsertEvalDefinitionInput) => ({
    id: input.id == null ? null : Number(input.id),
    name: String(input.name).trim(),
    scope: asScope(input.scope),
    dataType: asDataType(input.dataType),
    source: 'llm' as const, // code evaluators have no executor yet; don't let one be persisted

    judgePrompt: asOptString(input.judgePrompt),
    model: asOptString(input.model) ?? DEFAULT_JUDGE_MODEL,
    mode: asMode(input.mode),
    status: asStatus(input.status),
    // undefined = leave unchanged; null/object = normalized via parseLiveFilter.
    liveFilter: input.liveFilter === undefined ? undefined : parseLiveFilter(input.liveFilter),
  }))
  .handler(async ({ data }): Promise<EvalDefinition> => {
    if (!data.name) throw new Error('Evaluator name is required')
    const now = new Date()
    if (data.id != null) {
      const [existing] = await db.select().from(evalDefinitions).where(eq(evalDefinitions.id, data.id)).limit(1)
      if (!existing) throw new Error('Evaluator not found')
      // Bump version when the judge prompt or model changes (old scores keep theirs).
      const bump = existing.judgePrompt !== data.judgePrompt || existing.model !== data.model
      const [row] = await db
        .update(evalDefinitions)
        .set({
          name: data.name,
          scope: data.scope,
          dataType: data.dataType,
          source: data.source,
          judgePrompt: data.judgePrompt,
          model: data.model,
          mode: data.mode,
          status: data.status,
          ...(data.liveFilter !== undefined ? { liveFilter: data.liveFilter } : {}),
          version: bump ? existing.version + 1 : existing.version,
          updatedAt: now,
        })
        .where(eq(evalDefinitions.id, data.id))
        .returning()
      if (!row) throw new Error('upsertEvalDefinition: no row returned')
      return toDefinition(row)
    }
    const [row] = await db
      .insert(evalDefinitions)
      .values({
        name: data.name,
        scope: data.scope,
        dataType: data.dataType,
        source: data.source,
        judgePrompt: data.judgePrompt,
        model: data.model,
        mode: data.mode,
        status: data.status,
        liveFilter: data.liveFilter ?? null,
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    if (!row) throw new Error('upsertEvalDefinition: no row returned')
    return toDefinition(row)
  })

// Live ON = score prod traffic; OFF = back to the library.
export const setEvalDefinitionLive = createServerFn({ method: 'POST' })
  .inputValidator((input: { id: number; live: boolean }) => ({ id: Number(input.id), live: Boolean(input.live) }))
  .handler(async ({ data }): Promise<void> => {
    await db
      .update(evalDefinitions)
      .set({ mode: data.live ? 'online' : 'offline', updatedAt: new Date() })
      .where(eq(evalDefinitions.id, data.id))
  })

export const deleteEvalDefinition = createServerFn({ method: 'POST' })
  .inputValidator((id: number) => Number(id))
  .handler(async ({ data }): Promise<void> => {
    await db.delete(evalDefinitions).where(eq(evalDefinitions.id, data))
  })

export const getEvalRun = createServerFn({ method: 'GET' })
  .inputValidator((runId: number) => Number(runId))
  .handler(async ({ data }): Promise<EvalRun | null> => {
    const [row] = await db.select().from(evalRuns).where(eq(evalRuns.id, data)).limit(1)
    return row ? toRun(row) : null
  })

// Pin/unpin as a baseline; pinning also stamps the definition's baselineRunId
// so the regression view knows what to diff against.
export const blessEvalRun = createServerFn({ method: 'POST' })
  .inputValidator((input: { id: number; blessed: boolean }) => ({
    id: Number(input.id),
    blessed: Boolean(input.blessed),
  }))
  .handler(async ({ data }): Promise<EvalRun> => {
    const [row] = await db.update(evalRuns).set({ blessed: data.blessed }).where(eq(evalRuns.id, data.id)).returning()
    if (!row) throw new Error('Run not found')
    if (data.blessed) {
      await db
        .update(evalDefinitions)
        .set({ baselineRunId: row.id, updatedAt: new Date() })
        .where(eq(evalDefinitions.id, row.definitionId))
    }
    return toRun(row)
  })

export const compareRuns = createServerFn({ method: 'GET' })
  .inputValidator((input: { base: number; head: number }) => ({ base: Number(input.base), head: Number(input.head) }))
  .handler(async ({ data }): Promise<EvalCompareRow[]> => {
    const rows = await db
      .select()
      .from(scores)
      .where(inArray(scores.runId, [data.base, data.head]))
    const configs = await db.select().from(scoreConfigs)
    const scaleByName = scaleMap(configs)

    type Side = { values: number[]; bad: number; total: number; byCase: Map<string, boolean> }
    const make = (): Side => ({ values: [], bad: 0, total: 0, byCase: new Map() })
    const byName = new Map<string, { base: Side; head: Side }>()

    for (const r of rows) {
      // Errored cases aren't passes — exclude from totals so a timed-out judge
      // doesn't inflate the pass rate (matches the run summary's separate error count).
      if (r.errorType != null) continue
      const name = r.name
      let entry = byName.get(name)
      if (!entry) {
        entry = { base: make(), head: make() }
        byName.set(name, entry)
      }
      const side = r.runId === data.base ? entry.base : entry.head
      side.total += 1
      const scale = scaleByName.get(name)
      const bad = scoreIsBad({ dataType: r.dataType, value: r.value, label: r.label }, scale)
      if (bad) side.bad += 1
      if (r.value != null && (r.dataType === 'numeric' || r.dataType === 'boolean')) side.values.push(r.value)
      const caseKey = r.datasetRunItemId != null ? `d${r.datasetRunItemId}` : `${r.targetKind}:${r.targetId}`
      side.byCase.set(caseKey, bad)
    }

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
    const result: EvalCompareRow[] = []
    for (const [name, { base, head }] of byName) {
      let flippedToFail = 0
      let flippedToPass = 0
      for (const [key, headBad] of head.byCase) {
        const baseBad = base.byCase.get(key)
        if (baseBad === undefined) continue
        if (!baseBad && headBad) flippedToFail += 1
        if (baseBad && !headBad) flippedToPass += 1
      }
      result.push({
        name,
        baseAvg: avg(base.values),
        headAvg: avg(head.values),
        basePassRate: base.total ? 1 - base.bad / base.total : 0,
        headPassRate: head.total ? 1 - head.bad / head.total : 0,
        baseTotal: base.total,
        headTotal: head.total,
        flippedToFail,
        flippedToPass,
      })
    }
    return result.sort((a, b) => b.flippedToFail - a.flippedToFail)
  })

export const getJudgeDefaults = createServerFn({ method: 'GET' }).handler(async () => resolveJudgeDefaults())
