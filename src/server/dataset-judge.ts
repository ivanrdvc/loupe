import { createServerFn } from '@tanstack/react-start'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '#/db'
import { datasetExamples, datasetRunItems, datasetRuns, scores } from '#/db/schema'
import { type ScoreDataType, SCORE_DATA_TYPES } from '#/lib/evaluation'
import type { JsonValue } from '#/lib/json'
import type { ExampleInput } from '#/routes/datasets/-types'
import { MAX_JUDGE_SAMPLES, resolveJudgeDefaults, runJudgeSamples } from './judge'

export const DEFAULT_DATASET_JUDGE_PROMPT =
  'You are grading an agent answer. Given the question and (if present) the expected answer, decide whether the answer is correct. 1 = correct, 0 = incorrect.'

const DEFAULT_DIMENSION = 'correctness'

function asDataType(v: unknown): ScoreDataType {
  return typeof v === 'string' && SCORE_DATA_TYPES.includes(v as ScoreDataType) ? (v as ScoreDataType) : 'boolean'
}

export type JudgeDatasetRunResult = {
  runId: number
  judged: number
  pass: number
  fail: number
  errors: number
  passRate: number | null
}

export const judgeDatasetRun = createServerFn({ method: 'POST' })
  .inputValidator(
    (input: { runId: string | number; judgePrompt?: string | null; model?: string | null; samples?: number }) => ({
      runId: Number(input.runId),
      judgePrompt: input.judgePrompt == null ? null : String(input.judgePrompt).trim() || null,
      model: input.model == null ? null : String(input.model).trim() || null,
      samples:
        input.samples == null ? 1 : Math.max(1, Math.min(MAX_JUDGE_SAMPLES, Math.trunc(Number(input.samples)) || 1)),
    }),
  )
  .handler(async ({ data }): Promise<JudgeDatasetRunResult> => {
    const { endpointUrl, model: defaultModel, configured } = resolveJudgeDefaults()
    if (!configured) {
      throw new Error('The judge endpoint is not configured. Set JUDGE_ENDPOINT (or PROMPT_LIVE_ENDPOINT) and re-run.')
    }
    const model = data.model || defaultModel
    const dataType = asDataType('boolean')
    const dimension = DEFAULT_DIMENSION

    const [run] = await db.select().from(datasetRuns).where(eq(datasetRuns.id, data.runId)).limit(1)
    if (!run) throw new Error('judgeDatasetRun: run not found')

    const itemRows = await db
      .select()
      .from(datasetRunItems)
      .where(eq(datasetRunItems.runId, data.runId))
      .orderBy(asc(datasetRunItems.id))
    const exampleIds = [...new Set(itemRows.map((it) => it.exampleId))]
    const exRows = exampleIds.length
      ? await db.select().from(datasetExamples).where(inArray(datasetExamples.id, exampleIds))
      : []
    const exampleById = new Map(exRows.map((e) => [e.id, e]))

    let pass = 0
    let fail = 0
    let errors = 0
    let judged = 0
    const now = new Date()

    for (const item of itemRows) {
      if (item.status !== 'ok' || !item.output.trim()) continue
      const example = exampleById.get(item.exampleId)
      const input = (example?.inputJson as ExampleInput | null) ?? ''
      const fields: Record<string, JsonValue> = { input: input as JsonValue, output: item.output }

      const verdict = await runJudgeSamples(
        {
          endpointUrl,
          model,
          judgePrompt: data.judgePrompt || DEFAULT_DATASET_JUDGE_PROMPT,
          dataType,
          fields,
          expected: example?.expected ?? null,
        },
        data.samples,
      )
      judged += 1
      if (verdict.errorType) errors += 1
      else if (verdict.value === 0) fail += 1
      else if (verdict.value === 1) pass += 1

      const targetId = item.traceId ?? `item:${item.id}`
      await db
        .insert(scores)
        .values({
          targetKind: 'trace',
          targetId,
          parentTraceId: item.traceId ?? null,
          name: dimension,
          dataType,
          value: verdict.value,
          label: verdict.label,
          explanation: verdict.explanation,
          source: 'llm',
          evaluator: `judge:${model}`,
          errorType: verdict.errorType,
          datasetRunItemId: item.id,
          metadata: {
            samples: verdict.samples,
            variance: verdict.variance,
            perSample: verdict.perSample,
            inputTokens: verdict.inputTokens,
            outputTokens: verdict.outputTokens,
            raw: verdict.raw.slice(0, 2000),
          },
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [scores.targetKind, scores.targetId, scores.name, scores.evaluator],
          targetWhere: sql`run_id IS NULL`,
          set: {
            dataType,
            value: verdict.value,
            label: verdict.label,
            explanation: verdict.explanation,
            errorType: verdict.errorType,
            datasetRunItemId: item.id,
            createdAt: now,
          },
        })
    }

    const classified = pass + fail
    return { runId: data.runId, judged, pass, fail, errors, passRate: classified > 0 ? pass / classified : null }
  })
