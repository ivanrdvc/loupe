import { createServerFn } from '@tanstack/react-start'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '#/db'
import { datasetExamples, datasetRunItems, datasetRuns, evalDefinitions, scoreConfigs, scores } from '#/db/schema'
import type { ExampleInput } from '#/features/evaluation/dataset-types'
import type { ToolCall } from '#/features/evaluation/logic/span-eval-snapshot'
import { type ConfigHint, scorePassFail } from '#/lib/eval/evaluation'
import type { JsonValue } from '#/lib/json'
import { toolCallsFromTrace } from './eval-jobs'
import { MAX_JUDGE_SAMPLES, resolveJudgeDefaults, runJudgeSamples } from './judge'
import { scaleMap } from './scores'

const DEFAULT_DATASET_JUDGE_PROMPT =
  'You are grading an agent answer. Given the question and (if present) the expected answer, decide whether the answer is correct. 1 = correct, 0 = incorrect.'

const DEFAULT_DIMENSION = 'correctness'

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
    (input: {
      runId: string | number
      definitionId?: number | null
      judgePrompt?: string | null
      model?: string | null
      samples?: number
    }) => ({
      runId: Number(input.runId),
      definitionId: input.definitionId == null ? null : Number(input.definitionId),
      judgePrompt: input.judgePrompt == null ? null : String(input.judgePrompt).trim() || null,
      model: input.model == null ? null : String(input.model).trim() || null,
      samples:
        input.samples == null ? 1 : Math.max(1, Math.min(MAX_JUDGE_SAMPLES, Math.trunc(Number(input.samples)) || 1)),
    }),
  )
  .handler(async ({ data }): Promise<JudgeDatasetRunResult> => {
    const { model: defaultModel, configured } = resolveJudgeDefaults()
    if (!configured) {
      throw new Error('No judge model configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY and re-run.')
    }

    // Optionally grade with a chosen evaluator; else the default correctness judge.
    let def: typeof evalDefinitions.$inferSelect | null = null
    if (data.definitionId != null) {
      const [row] = await db.select().from(evalDefinitions).where(eq(evalDefinitions.id, data.definitionId)).limit(1)
      if (!row) throw new Error('judgeDatasetRun: evaluator not found')
      if (row.source !== 'llm') throw new Error('Only LLM-judge evaluators can grade a dataset')
      def = row
    }

    const dimension = def?.name ?? DEFAULT_DIMENSION
    const dataType = def?.dataType ?? 'boolean'
    const judgePrompt = data.judgePrompt || def?.judgePrompt || DEFAULT_DATASET_JUDGE_PROMPT
    const model = data.model || def?.model || defaultModel

    const [cfg] = await db.select().from(scoreConfigs).where(eq(scoreConfigs.name, dimension)).limit(1)
    const categories = (cfg?.categories ?? null) as string[] | null
    const scale: ConfigHint | undefined = cfg ? scaleMap([cfg]).get(dimension) : undefined

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

      // Prefer the run-time snapshot; recover from the trace for pre-snapshot rows.
      let toolCalls = (item.toolCallsJson as ToolCall[] | null) ?? null
      if (toolCalls == null && item.traceId) toolCalls = await toolCallsFromTrace(item.traceId)
      if (toolCalls && toolCalls.length > 0) fields.toolCalls = toolCalls as JsonValue

      const verdict = await runJudgeSamples(
        {
          model,
          judgePrompt,
          dataType,
          categories,
          minValue: cfg?.minValue ?? null,
          maxValue: cfg?.maxValue ?? null,
          fields,
          expected: example?.expected ?? null,
        },
        data.samples,
      )
      judged += 1
      if (verdict.errorType) {
        errors += 1
      } else {
        const pf = scorePassFail({ dataType, value: verdict.value, label: verdict.label }, scale)
        if (pf === 'fail') fail += 1
        else if (pf === 'pass') pass += 1
      }

      const targetId = `item:${item.id}`
      const metadata = {
        samples: verdict.samples,
        variance: verdict.variance,
        perSample: verdict.perSample,
        inputTokens: verdict.inputTokens,
        outputTokens: verdict.outputTokens,
        raw: verdict.raw.slice(0, 2000),
      }
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
          evaluatorVersion: def?.version ?? null,
          errorType: verdict.errorType,
          definitionId: def?.id ?? null,
          datasetRunItemId: item.id,
          metadata,
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
            evaluatorVersion: def?.version ?? null,
            errorType: verdict.errorType,
            definitionId: def?.id ?? null,
            datasetRunItemId: item.id,
            metadata,
            createdAt: now,
          },
        })
    }

    const classified = pass + fail
    return { runId: data.runId, judged, pass, fail, errors, passRate: classified > 0 ? pass / classified : null }
  })
