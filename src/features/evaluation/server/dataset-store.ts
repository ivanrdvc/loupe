import { and, eq, sql } from 'drizzle-orm'
import { db } from '#/db'
import { datasetExamples, datasets } from '#/db/schema'
import type {
  CreateDatasetInput,
  Dataset,
  DatasetExample,
  ExampleInput,
  UpsertExampleInput,
} from '#/features/evaluation/dataset-types'

// Server-only dataset persistence. Kept out of `datasets.ts` (which client
// components import for its server functions) because these are plain, non-handler
// db users: leaving them there pins `#/db` — and thus better-sqlite3 — into the
// client bundle, where it crashes (`util.promisify is not a function`).

export function toDataset(row: typeof datasets.$inferSelect): Dataset {
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

export function toExample(row: typeof datasetExamples.$inferSelect): DatasetExample {
  return {
    id: String(row.id),
    datasetId: String(row.datasetId),
    input: (row.inputJson as ExampleInput | null) ?? '',
    expected: row.expected,
    metadata: (row.metadataJson as Record<string, string> | null) ?? {},
    sourceTraceId: row.sourceTraceId,
    sourceSpanId: row.sourceSpanId,
  }
}

export function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((t) => String(t).trim()).filter((t) => t.length > 0)
}

export function bumpVersion(datasetId: number, now: Date) {
  return db
    .update(datasets)
    .set({ version: sql`${datasets.version} + 1`, updatedAt: now })
    .where(eq(datasets.id, datasetId))
}

export function createDatasetWithExamples(
  input: CreateDatasetInput,
  examples: Array<Omit<UpsertExampleInput, 'datasetId' | 'exampleId'>>,
): Dataset {
  const name = String(input.name).trim()
  if (!name) throw new Error('Dataset name is required')
  if (examples.length === 0) throw new Error('At least one dataset example is required')
  const unique = new Map<string, (typeof examples)[number]>()
  const withoutSource: typeof examples = []
  for (const example of examples) {
    if (example.sourceTraceId && example.sourceSpanId) {
      unique.set(`${example.sourceTraceId}:${example.sourceSpanId}`, example)
    } else {
      withoutSource.push(example)
    }
  }
  const deduped = [...unique.values(), ...withoutSource]
  const now = new Date()
  return db.transaction((tx) => {
    const row = tx
      .insert(datasets)
      .values({
        name,
        description: input.description == null ? null : String(input.description),
        tagsJson: asTags(input.tags),
        version: examples.length + 1,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    for (const example of deduped) {
      tx.insert(datasetExamples)
        .values({
          datasetId: row.id,
          inputJson: example.input,
          expected: example.expected == null ? null : String(example.expected),
          metadataJson: example.metadata && typeof example.metadata === 'object' ? example.metadata : {},
          sourceTraceId: example.sourceTraceId == null ? null : String(example.sourceTraceId),
          sourceSpanId: example.sourceSpanId == null ? null : String(example.sourceSpanId),
          createdAt: now,
          updatedAt: now,
        })
        .run()
    }
    return toDataset(row)
  })
}

export interface UpdateDatasetMetaInput {
  datasetId: string | number
  name?: string
  description?: string | null
  tags?: string[]
  endpointOverride?: string | null
}

export async function updateDatasetMeta(input: UpdateDatasetMetaInput): Promise<Dataset> {
  const data = {
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
  }
  // version only tracks example mutations, so metadata edits don't bump it
  const set: Partial<typeof datasets.$inferInsert> = { updatedAt: new Date() }
  if (data.name !== undefined) set.name = data.name
  if (data.description !== undefined) set.description = data.description
  if (data.tags !== undefined) set.tagsJson = data.tags
  if (data.endpointOverride !== undefined) set.endpointOverride = data.endpointOverride
  const [row] = await db.update(datasets).set(set).where(eq(datasets.id, data.datasetId)).returning()
  if (!row) throw new Error('updateDataset: dataset not found')
  return toDataset(row)
}

export async function upsertDatasetExample(input: UpsertExampleInput): Promise<DatasetExample> {
  const data = {
    datasetId: Number(input.datasetId),
    exampleId: input.exampleId == null ? null : Number(input.exampleId),
    input: input.input,
    expected: input.expected == null ? null : String(input.expected),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
    sourceTraceId: input.sourceTraceId == null ? null : String(input.sourceTraceId),
    sourceSpanId: input.sourceSpanId == null ? null : String(input.sourceSpanId),
  }
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
  // Capturing the same span twice updates the existing example instead of duplicating it.
  if (data.sourceTraceId && data.sourceSpanId) {
    const [existing] = await db
      .select()
      .from(datasetExamples)
      .where(
        and(
          eq(datasetExamples.datasetId, data.datasetId),
          eq(datasetExamples.sourceTraceId, data.sourceTraceId),
          eq(datasetExamples.sourceSpanId, data.sourceSpanId),
        ),
      )
    if (existing) {
      const [row] = await db
        .update(datasetExamples)
        .set({
          inputJson: data.input,
          expected: data.expected,
          metadataJson: data.metadata,
          updatedAt: now,
        })
        .where(eq(datasetExamples.id, existing.id))
        .returning()
      if (!row) throw new Error('upsertExample: update failed')
      await bumpVersion(data.datasetId, now)
      return toExample(row)
    }
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
}
