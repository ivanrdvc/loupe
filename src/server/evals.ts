import { createServerFn } from '@tanstack/react-start'
import { desc, eq, inArray } from 'drizzle-orm'
import { db } from '#/db'
import { evalDefinitions, evalRuns, scoreConfigs, scores } from '#/db/schema'
import {
  type ConfigHint,
  type EvalCompareRow,
  type EvalDefinition,
  type EvalMode,
  type EvalRun,
  type EvalRunSummary,
  type EvalScope,
  type EvalStatus,
  type EvalTargetSelector,
  SCORE_DATA_TYPES,
  SCORE_TARGET_KINDS,
  type ScoreDataType,
  type ScoreTargetKind,
  scoreIsBad,
  scorePassFail,
  type UpsertEvalDefinitionInput,
} from '#/lib/eval/evaluation'
import { DEFAULT_JUDGE_MODEL } from '#/lib/eval/models'
import type { JsonValue } from '#/lib/json'
import type { JudgeCaseInput } from './eval-jobs'
import { MAX_JUDGE_SAMPLES, resolveJudgeDefaults, runJudgeSamples } from './judge'
import { parseLiveFilter } from './online-eval-filter'
import { configToHint, scaleMap } from './scores'

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

function asRecord(v: unknown, label: string): Record<string, unknown> {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${label} must be an object`)
  return v as Record<string, unknown>
}

function asRequiredInt(v: unknown, label: string): number {
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`${label} must be a number`)
  return Math.trunc(n)
}

function asOptionalInt(v: unknown, label: string): number | null {
  if (v == null || v === '') return null
  return asRequiredInt(v, label)
}

function asRequiredString(v: unknown, label: string): string {
  const s = asOptString(v)
  if (!s) throw new Error(`${label} is required`)
  return s
}

function asJsonValue(v: unknown, label: string): JsonValue {
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`${label} must be JSON-serializable`)
    return v
  }
  if (Array.isArray(v)) return v.map((item, i) => asJsonValue(item, `${label}[${i}]`))
  if (typeof v === 'object') {
    const out: Record<string, JsonValue> = {}
    for (const [key, value] of Object.entries(v)) out[key] = asJsonValue(value, `${label}.${key}`)
    return out
  }
  throw new Error(`${label} must be JSON-serializable`)
}

function asJsonObject(v: unknown, label: string): Record<string, JsonValue> {
  const obj = asRecord(v, label)
  const out: Record<string, JsonValue> = {}
  for (const [key, value] of Object.entries(obj)) out[key] = asJsonValue(value, `${label}.${key}`)
  return out
}

function asRunTargetKind(v: unknown, label: string): ScoreTargetKind {
  if (typeof v === 'string' && SCORE_TARGET_KINDS.includes(v as ScoreTargetKind)) return v as ScoreTargetKind
  throw new Error(`Invalid ${label}: ${String(v)}`)
}

function asTargetSelector(v: unknown): EvalTargetSelector | null {
  if (v == null) return null
  const obj = asRecord(v, 'targetSelector')
  if (obj.kind === 'dataset')
    return { kind: 'dataset', datasetId: asRequiredInt(obj.datasetId, 'targetSelector.datasetId') }
  if (obj.kind === 'traces') {
    if (!Array.isArray(obj.traceIds)) throw new Error('targetSelector.traceIds must be an array')
    return {
      kind: 'traces',
      traceIds: obj.traceIds.map((id, i) => asRequiredString(id, `targetSelector.traceIds[${i}]`)),
    }
  }
  if (obj.kind === 'spans') {
    if (!Array.isArray(obj.spanIds)) throw new Error('targetSelector.spanIds must be an array')
    return { kind: 'spans', spanIds: obj.spanIds.map((id, i) => asRequiredString(id, `targetSelector.spanIds[${i}]`)) }
  }
  throw new Error(`Invalid targetSelector.kind: ${String(obj.kind)}`)
}

function asJudgeCase(raw: unknown, index: number): JudgeCaseInput {
  const label = `cases[${index}]`
  const obj = asRecord(raw, label)
  return {
    targetKind: asRunTargetKind(obj.targetKind, `${label}.targetKind`),
    targetId: asRequiredString(obj.targetId, `${label}.targetId`),
    parentTraceId: asOptString(obj.parentTraceId),
    parentSessionId: asOptString(obj.parentSessionId),
    sessionSource: obj.sessionSource === 'attribute' || obj.sessionSource === 'trace' ? obj.sessionSource : null,
    datasetRunItemId: asOptionalInt(obj.datasetRunItemId, `${label}.datasetRunItemId`),
    promptVersionId: asOptionalInt(obj.promptVersionId, `${label}.promptVersionId`),
    fields: asJsonObject(obj.fields, `${label}.fields`),
    expected: obj.expected == null ? null : asJsonValue(obj.expected, `${label}.expected`),
  }
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

// definitions
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
    // undefined = leave unchanged; null/object = normalized via parseLiveFilter server-side.
    liveFilter: input.liveFilter === undefined ? undefined : asJsonValue(input.liveFilter ?? null, 'liveFilter'),
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
          ...(data.liveFilter !== undefined ? { liveFilter: parseLiveFilter(data.liveFilter) } : {}),
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
        liveFilter: data.liveFilter !== undefined ? parseLiveFilter(data.liveFilter) : null,
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

// runs
export const listEvalRuns = createServerFn({ method: 'GET' })
  .inputValidator((definitionId?: number | null) => (definitionId == null ? null : Number(definitionId)))
  .handler(async ({ data }): Promise<EvalRun[]> => {
    const rows =
      data == null
        ? await db.select().from(evalRuns).orderBy(desc(evalRuns.createdAt))
        : await db.select().from(evalRuns).where(eq(evalRuns.definitionId, data)).orderBy(desc(evalRuns.createdAt))
    return rows.map(toRun)
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

// the run executor (Path B)
// Creates the run row and returns immediately as 'running'; the judge loop runs as
// a background job, writing scores + updating the summary per case as the UI polls.
export const runEval = createServerFn({ method: 'POST' })
  .inputValidator(
    (
      input: unknown,
    ): {
      definitionId: number
      model: string | null
      samples: number
      cases: JudgeCaseInput[]
      targetSelector: EvalTargetSelector | null
      gitSha: string | null
      env: string | null
    } => {
      const obj = asRecord(input, 'runEval input')
      if (!Array.isArray(obj.cases)) throw new Error('cases must be an array')
      return {
        definitionId: asRequiredInt(obj.definitionId, 'definitionId'),
        model: asOptString(obj.model),
        samples:
          obj.samples == null ? 1 : Math.max(1, Math.min(MAX_JUDGE_SAMPLES, asRequiredInt(obj.samples, 'samples'))),
        cases: obj.cases.map(asJudgeCase),
        targetSelector: asTargetSelector(obj.targetSelector),
        gitSha: asOptString(obj.gitSha),
        env: asOptString(obj.env),
      }
    },
  )
  .handler(async ({ data }): Promise<EvalRun> => {
    const [defRow] = await db.select().from(evalDefinitions).where(eq(evalDefinitions.id, data.definitionId)).limit(1)
    if (!defRow) throw new Error('Evaluator not found')
    const def = toDefinition(defRow)
    // No code runner yet — refuse rather than produce LLM verdicts mislabeled source='code'.
    if (def.source !== 'llm')
      throw new Error('Only LLM-judge evaluators can be run today (code evaluators are not yet supported)')
    const model = data.model || def.model

    const now = new Date()
    const [runRow] = await db
      .insert(evalRuns)
      .values({
        definitionId: def.id,
        definitionVersion: def.version,
        status: 'running',
        targetSelector: data.targetSelector,
        gitSha: data.gitSha,
        env: data.env,
        startedAt: now,
        summary: { total: data.cases.length, done: 0, pass: 0, fail: 0, errors: 0, costUsd: 0, model },
        createdAt: now,
      })
      .returning()
    if (!runRow) throw new Error('runEval: could not create run')

    // Fire-and-forget: the response returns now; errors are caught and recorded.
    void executeEvalRun({ runId: runRow.id, def, model, samples: data.samples, cases: data.cases }).catch(
      async (err) => {
        await db.update(evalRuns).set({ status: 'error', endedAt: new Date() }).where(eq(evalRuns.id, runRow.id))
        console.error('[runEval] background run failed', err)
      },
    )

    return toRun(runRow)
  })

async function executeEvalRun(opts: {
  runId: number
  def: EvalDefinition
  model: string
  samples: number
  cases: JudgeCaseInput[]
}): Promise<void> {
  const { runId, def, model, samples, cases } = opts
  const { configured } = resolveJudgeDefaults()
  const summary: EvalRunSummary = { total: cases.length, done: 0, pass: 0, fail: 0, errors: 0, costUsd: 0, model }

  if (!configured) {
    await db
      .update(evalRuns)
      .set({ status: 'error', endedAt: new Date(), summary: { ...summary, errors: cases.length } })
      .where(eq(evalRuns.id, runId))
    return
  }

  const [cfg] = await db.select().from(scoreConfigs).where(eq(scoreConfigs.name, def.name)).limit(1)
  const categories = (cfg?.categories ?? null) as string[] | null
  // Full polarity/scale hint so the summary's pass/fail honors the config.
  const scale: ConfigHint | undefined = cfg ? configToHint(cfg) : undefined

  for (const c of cases) {
    const verdict = await runJudgeSamples(
      {
        model,
        judgePrompt: def.judgePrompt,
        dataType: def.dataType,
        categories,
        // Bound the numeric verdict to the configured range via the output schema.
        minValue: cfg?.minValue ?? null,
        maxValue: cfg?.maxValue ?? null,
        fields: c.fields,
        expected: c.expected ?? null,
      },
      samples,
    )
    summary.costUsd = (summary.costUsd ?? 0) + verdict.costUsd
    summary.done = (summary.done ?? 0) + 1
    if (verdict.errorType) {
      summary.errors = (summary.errors ?? 0) + 1
    } else {
      // Only classifiable cases bucket; text/unknown-categorical count as neither.
      const pf = scorePassFail({ dataType: def.dataType, value: verdict.value, label: verdict.label }, scale)
      if (pf === 'fail') summary.fail = (summary.fail ?? 0) + 1
      else if (pf === 'pass') summary.pass = (summary.pass ?? 0) + 1
    }
    await db.insert(scores).values({
      targetKind: c.targetKind,
      targetId: c.targetId,
      parentTraceId: c.parentTraceId ?? null,
      parentSessionId: c.parentSessionId ?? null,
      sessionSource: c.sessionSource ?? null,
      name: def.name,
      dataType: def.dataType,
      value: verdict.value,
      label: verdict.label,
      explanation: verdict.explanation,
      source: def.source,
      evaluator: `judge:${model}`,
      evaluatorVersion: def.version,
      errorType: verdict.errorType,
      runId,
      definitionId: def.id,
      promptVersionId: c.promptVersionId ?? null,
      datasetRunItemId: c.datasetRunItemId ?? null,
      metadata: {
        samples: verdict.samples,
        variance: verdict.variance,
        perSample: verdict.perSample,
        inputTokens: verdict.inputTokens,
        outputTokens: verdict.outputTokens,
        raw: verdict.raw.slice(0, 2000),
      },
      createdAt: new Date(),
    })
    // Update the run summary incrementally so pollers see progress fill in.
    await db.update(evalRuns).set({ summary }).where(eq(evalRuns.id, runId))
  }

  // A run where every case errored (e.g. the judge provider was reachable-but-failing
  // the whole time) is itself an error, not a "done" run with incidental errors — this
  // also lets the run detail surface the judge hint (judgeErrorHint).
  const allErrored = (summary.total ?? 0) > 0 && summary.errors === summary.total
  await db
    .update(evalRuns)
    .set({ status: allErrored ? 'error' : 'done', endedAt: new Date(), summary })
    .where(eq(evalRuns.id, runId))
}

// compare / baselines
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
