import { randomUUID } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '#/db'
import { datasetExamples, datasetRunItems, datasetRuns, datasets } from '#/db/schema'
import { getSession } from '#/lib/telemetry'
import {
  type CreateDatasetInput,
  type Dataset,
  type DatasetDetail,
  type DatasetExample,
  type DatasetListItem,
  type DatasetRun,
  type DatasetRunItem,
  type ExampleInput,
  GLOBAL_DEFAULT_ENDPOINT,
  type RunItemStatus,
  type UpsertExampleInput,
} from '#/routes/datasets/-types'
import { callAgent } from './agent-run'

function toDataset(row: typeof datasets.$inferSelect): Dataset {
  return {
    id: String(row.id),
    name: row.name,
    description: row.description,
    tags: (row.tagsJson as string[] | null) ?? [],
    updatedAt: row.updatedAt.getTime(),
    lastRunAt: null,
    version: row.version,
    endpointOverride: row.endpointOverride,
  }
}

function toExample(row: typeof datasetExamples.$inferSelect): DatasetExample {
  return {
    id: String(row.id),
    datasetId: String(row.datasetId),
    input: (row.inputJson as ExampleInput | null) ?? '',
    expected: row.expected,
    metadata: (row.metadataJson as Record<string, string> | null) ?? {},
    sourceTraceId: row.sourceTraceId,
  }
}

function toRun(row: typeof datasetRuns.$inferSelect): DatasetRun {
  return {
    id: String(row.id),
    datasetId: String(row.datasetId),
    label: row.label,
    createdAt: row.createdAt.getTime(),
    version: row.datasetVersion,
    passRate: null,
  }
}

function toRunItem(row: typeof datasetRunItems.$inferSelect, status: RunItemStatus): DatasetRunItem {
  return {
    runId: String(row.runId),
    exampleId: String(row.exampleId),
    output: row.output,
    status,
    latencyMs: row.latencyMs,
    tokens: row.tokens,
    traceId: row.traceId,
    pass: null,
  }
}

function globalDefaultEndpoint(): string {
  return process.env.DATASET_RUN_ENDPOINT ?? process.env.PROMPT_LIVE_ENDPOINT ?? GLOBAL_DEFAULT_ENDPOINT
}

// Optional agent id sent as metadata.entity_id — needed by entity-routed agents (the MAF
// sandbox, DevUI). Unset = truly-dumb target, we POST {input, conversation_id} only.
function defaultAgentName(): string | null {
  return process.env.DATASET_RUN_AGENT ?? process.env.PROMPT_LIVE_AGENT ?? null
}

function effectiveEndpoint(override: string | null): string {
  const o = override?.trim()
  return o && o.length > 0 ? o : globalDefaultEndpoint()
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((t) => String(t).trim()).filter((t) => t.length > 0)
}

function runLabel(at: Date): string {
  const hh = String(at.getHours()).padStart(2, '0')
  const mm = String(at.getMinutes()).padStart(2, '0')
  return `run · ${hh}:${mm}`
}

export const getDatasetRunDefaults = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ endpointUrl: string }> => ({ endpointUrl: globalDefaultEndpoint() }),
)

export const listDatasets = createServerFn({ method: 'GET' }).handler(async (): Promise<DatasetListItem[]> => {
  const dsRows = await db.select().from(datasets).orderBy(desc(datasets.updatedAt))
  const exRows = await db.select({ datasetId: datasetExamples.datasetId }).from(datasetExamples)
  const runRows = await db
    .select({ datasetId: datasetRuns.datasetId, createdAt: datasetRuns.createdAt })
    .from(datasetRuns)

  const exCount = new Map<number, number>()
  for (const r of exRows) exCount.set(r.datasetId, (exCount.get(r.datasetId) ?? 0) + 1)
  const runCount = new Map<number, number>()
  const lastRun = new Map<number, number>()
  for (const r of runRows) {
    runCount.set(r.datasetId, (runCount.get(r.datasetId) ?? 0) + 1)
    const ms = r.createdAt.getTime()
    lastRun.set(r.datasetId, Math.max(lastRun.get(r.datasetId) ?? 0, ms))
  }

  return dsRows.map((row) => ({
    ...toDataset(row),
    lastRunAt: lastRun.get(row.id) ?? null,
    exampleCount: exCount.get(row.id) ?? 0,
    runCount: runCount.get(row.id) ?? 0,
  }))
})

export const getDatasetDetail = createServerFn({ method: 'GET' })
  .inputValidator((input: { datasetId: string | number }) => ({ datasetId: Number(input.datasetId) }))
  .handler(async ({ data }): Promise<DatasetDetail | null> => {
    if (!Number.isFinite(data.datasetId)) return null
    const [dsRow] = await db.select().from(datasets).where(eq(datasets.id, data.datasetId)).limit(1)
    if (!dsRow) return null

    const exRows = await db
      .select()
      .from(datasetExamples)
      .where(eq(datasetExamples.datasetId, data.datasetId))
      .orderBy(asc(datasetExamples.id))
    const runRows = await db
      .select()
      .from(datasetRuns)
      .where(eq(datasetRuns.datasetId, data.datasetId))
      .orderBy(desc(datasetRuns.createdAt))
    const runIds = runRows.map((r) => r.id)
    const itemRows =
      runIds.length > 0 ? await db.select().from(datasetRunItems).where(inArray(datasetRunItems.runId, runIds)) : []

    const runs = runRows.map(toRun)
    const lastRunAt = runRows.length > 0 ? Math.max(...runRows.map((r) => r.createdAt.getTime())) : null

    // 'changed' is derived, not stored: an answer differs from the same example's prior run.
    const chrono = [...runRows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    const byKey = new Map<string, typeof datasetRunItems.$inferSelect>()
    for (const it of itemRows) byKey.set(`${it.runId}:${it.exampleId}`, it)
    const derivedStatus = new Map<string, RunItemStatus>()
    for (const ex of exRows) {
      let prevOk: string | null = null
      for (const run of chrono) {
        const it = byKey.get(`${run.id}:${ex.id}`)
        if (!it) continue
        let status: RunItemStatus = it.status
        if (it.status === 'ok') {
          if (prevOk != null && it.output !== prevOk) status = 'changed'
          prevOk = it.output
        }
        derivedStatus.set(`${it.runId}:${it.exampleId}`, status)
      }
    }

    const items = itemRows.map((it) => toRunItem(it, derivedStatus.get(`${it.runId}:${it.exampleId}`) ?? it.status))

    return { dataset: { ...toDataset(dsRow), lastRunAt }, examples: exRows.map(toExample), runs, items }
  })

export const createDataset = createServerFn({ method: 'POST' })
  .inputValidator((input: CreateDatasetInput) => ({
    name: String(input.name).trim(),
    description: input.description == null ? null : String(input.description),
    tags: asTags(input.tags),
  }))
  .handler(async ({ data }): Promise<Dataset> => {
    if (!data.name) throw new Error('Dataset name is required')
    const now = new Date()
    const [row] = await db
      .insert(datasets)
      .values({
        name: data.name,
        description: data.description,
        tagsJson: data.tags,
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    if (!row) throw new Error('createDataset: no row returned')
    return toDataset(row)
  })

export const updateDataset = createServerFn({ method: 'POST' })
  .inputValidator(
    (input: {
      datasetId: string | number
      name?: string
      description?: string | null
      tags?: string[]
      endpointOverride?: string | null
    }) => ({
      datasetId: Number(input.datasetId),
      name: input.name === undefined ? undefined : String(input.name).trim(),
      description:
        input.description === undefined ? undefined : input.description === null ? null : String(input.description),
      tags: input.tags === undefined ? undefined : asTags(input.tags),
      endpointOverride:
        input.endpointOverride === undefined
          ? undefined
          : input.endpointOverride === null
            ? null
            : String(input.endpointOverride).trim() || null,
    }),
  )
  .handler(async ({ data }): Promise<Dataset> => {
    // version only tracks example mutations, so metadata edits don't bump it
    const set: Partial<typeof datasets.$inferInsert> = { updatedAt: new Date() }
    if (data.name !== undefined) set.name = data.name
    if (data.description !== undefined) set.description = data.description
    if (data.tags !== undefined) set.tagsJson = data.tags
    if (data.endpointOverride !== undefined) set.endpointOverride = data.endpointOverride
    const [row] = await db.update(datasets).set(set).where(eq(datasets.id, data.datasetId)).returning()
    if (!row) throw new Error('updateDataset: dataset not found')
    return toDataset(row)
  })

export const deleteDataset = createServerFn({ method: 'POST' })
  .inputValidator((input: { datasetId: string | number }) => ({ datasetId: Number(input.datasetId) }))
  .handler(async ({ data }): Promise<void> => {
    await db.delete(datasets).where(eq(datasets.id, data.datasetId))
  })

function bumpVersion(datasetId: number, now: Date) {
  return db
    .update(datasets)
    .set({ version: sql`${datasets.version} + 1`, updatedAt: now })
    .where(eq(datasets.id, datasetId))
}

export const upsertExample = createServerFn({ method: 'POST' })
  .inputValidator((input: UpsertExampleInput) => ({
    datasetId: Number(input.datasetId),
    exampleId: input.exampleId == null ? null : Number(input.exampleId),
    input: input.input,
    expected: input.expected == null ? null : String(input.expected),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    sourceTraceId: input.sourceTraceId == null ? null : String(input.sourceTraceId),
    sourceSpanId: input.sourceSpanId == null ? null : String(input.sourceSpanId),
  }))
  .handler(async ({ data }): Promise<DatasetExample> => {
    const now = new Date()
    if (data.exampleId != null) {
      const [row] = await db
        .update(datasetExamples)
        .set({
          inputJson: data.input,
          expected: data.expected,
          metadataJson: data.metadata,
          sourceTraceId: data.sourceTraceId,
          sourceSpanId: data.sourceSpanId,
          updatedAt: now,
        })
        .where(eq(datasetExamples.id, data.exampleId))
        .returning()
      if (!row) throw new Error('upsertExample: example not found')
      await bumpVersion(data.datasetId, now)
      return toExample(row)
    }
    const [row] = await db
      .insert(datasetExamples)
      .values({
        datasetId: data.datasetId,
        inputJson: data.input,
        expected: data.expected,
        metadataJson: data.metadata,
        sourceTraceId: data.sourceTraceId,
        sourceSpanId: data.sourceSpanId,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    if (!row) throw new Error('upsertExample: insert failed')
    await bumpVersion(data.datasetId, now)
    return toExample(row)
  })

export const deleteExamples = createServerFn({ method: 'POST' })
  .inputValidator((input: { datasetId: string | number; exampleIds: Array<string | number> }) => ({
    datasetId: Number(input.datasetId),
    exampleIds: (Array.isArray(input.exampleIds) ? input.exampleIds : []).map(Number).filter(Number.isFinite),
  }))
  .handler(async ({ data }): Promise<void> => {
    if (data.exampleIds.length === 0) return
    await db.delete(datasetExamples).where(inArray(datasetExamples.id, data.exampleIds))
    await bumpVersion(data.datasetId, new Date())
  })

const TRACE_RESOLVE_DELAY_MS = 1_500
const TRACE_RESOLVE_WINDOW_MS = 10 * 60_000

export const runDataset = createServerFn({ method: 'POST' })
  .inputValidator(
    (input: { datasetId: string | number; endpointUrl?: string; exampleIds?: Array<string | number> }) => ({
      datasetId: Number(input.datasetId),
      endpointUrl: input.endpointUrl == null ? null : String(input.endpointUrl).trim(),
      exampleIds:
        input.exampleIds == null
          ? null
          : (Array.isArray(input.exampleIds) ? input.exampleIds : []).map(Number).filter(Number.isFinite),
    }),
  )
  .handler(async ({ data }): Promise<{ runId: string }> => {
    const [ds] = await db.select().from(datasets).where(eq(datasets.id, data.datasetId)).limit(1)
    if (!ds) throw new Error('runDataset: dataset not found')

    const endpointUrl =
      data.endpointUrl && data.endpointUrl.length > 0 ? data.endpointUrl : effectiveEndpoint(ds.endpointOverride)

    let exRows = await db
      .select()
      .from(datasetExamples)
      .where(eq(datasetExamples.datasetId, data.datasetId))
      .orderBy(asc(datasetExamples.id))
    if (data.exampleIds && data.exampleIds.length > 0) {
      const wanted = new Set(data.exampleIds)
      exRows = exRows.filter((e) => wanted.has(e.id))
    }
    if (exRows.length === 0) throw new Error('runDataset: dataset has no examples to run')

    const now = new Date()
    const [run] = await db
      .insert(datasetRuns)
      .values({
        datasetId: data.datasetId,
        datasetVersion: ds.version,
        label: runLabel(now),
        endpointUrl,
        status: 'running',
        createdAt: now,
      })
      .returning()
    if (!run) throw new Error('runDataset: run insert failed')

    // conversation_id is the key loupe groups traces on; the agent echoes it onto its spans.
    const agentName = defaultAgentName()
    const conversationIds = new Map<number, string>()
    for (const ex of exRows) {
      const conversationId = randomUUID()
      conversationIds.set(ex.id, conversationId)
      const input = (ex.inputJson as ExampleInput | null) ?? ''
      try {
        const res = await callAgent({ endpointUrl, input, conversationId, agentName })
        await db.insert(datasetRunItems).values({
          runId: run.id,
          exampleId: ex.id,
          output: res.text,
          status: 'ok',
          latencyMs: res.durationMs,
          tokens: res.tokens,
          conversationId,
          rawJson: res.rawJson,
          createdAt: new Date(),
        })
      } catch (err) {
        await db.insert(datasetRunItems).values({
          runId: run.id,
          exampleId: ex.id,
          output: '',
          status: 'error',
          conversationId,
          errorText: err instanceof Error ? err.message : String(err),
          createdAt: new Date(),
        })
      }
    }

    await db.update(datasetRuns).set({ status: 'complete' }).where(eq(datasetRuns.id, run.id))

    // Best-effort trace linkage: wait for ingestion, resolve each conversation_id to a trace.
    await new Promise((r) => setTimeout(r, TRACE_RESOLVE_DELAY_MS))
    const toUs = (Date.now() + 60_000) * 1000
    const fromUs = (Date.now() - TRACE_RESOLVE_WINDOW_MS) * 1000
    await Promise.allSettled(
      [...conversationIds.entries()].map(async ([exampleId, conversationId]) => {
        try {
          const session = await getSession(conversationId, { fromUs, toUs })
          const traceId = session?.traceIds?.[0]
          if (traceId) {
            await db
              .update(datasetRunItems)
              .set({ traceId })
              .where(and(eq(datasetRunItems.runId, run.id), eq(datasetRunItems.exampleId, exampleId)))
          }
        } catch {
          // not ingested yet / provider down — leave traceId null
        }
      }),
    )

    return { runId: String(run.id) }
  })
