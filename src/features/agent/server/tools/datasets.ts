import { tool } from 'ai'
import { z } from 'zod'
import {
  createDataset,
  getDatasetDetail,
  listDatasets,
  updateDataset,
  upsertExample,
} from '#/features/evaluation/server/datasets'
import { captureAll, deriveMeta, exampleEntrySchema } from './shared'

/**
 * List datasets, or fetch one with its examples.
 */
export const getDatasetTool = () =>
  tool({
    description:
      'List the user datasets (omit datasetId) or fetch one with its examples (with datasetId). Call this to find the target before update_dataset.',
    inputSchema: z.object({ datasetId: z.string().optional().describe('Dataset id; omit to list all datasets.') }),
    execute: async ({ datasetId }) => {
      if (datasetId == null) {
        const rows = await listDatasets()
        return { datasets: rows.map((d) => ({ id: d.id, name: d.name, examples: d.exampleCount, runs: d.runCount })) }
      }
      const detail = await getDatasetDetail({ data: { datasetId } })
      if (!detail) return { found: false as const }
      return {
        found: true as const,
        id: detail.dataset.id,
        name: detail.dataset.name,
        examples: detail.examples.map((e) => ({ id: e.id, expected: e.expected, sourceTraceId: e.sourceTraceId })),
      }
    },
  })

/**
 * Create a new dataset from traces or sessions and populate it.
 */
export const createDatasetTool = (origin?: string) =>
  tool({
    description:
      'Create a new dataset from traces or sessions and populate it. Each example pulls its question from the trace; expected defaults to the observed output — a regression baseline (what it did last time), NOT a verified-correct answer, so tell the user to review it. Omit name/tags/description to auto-derive them from the captured agent; only pass a name when the user gave an explicit title. Populate per-example metadata when you can infer it.',
    inputSchema: z.object({
      name: z.string().optional().describe('Only when the user gave an explicit title; omit to derive from the agent.'),
      description: z.string().optional(),
      tags: z.array(z.string()).optional().describe('Dataset tags; omit to derive (agent name + "regression").'),
      examples: z.array(exampleEntrySchema).min(1),
    }),
    execute: async ({ name, description, tags, examples }) => {
      const resolved = await captureAll(examples)
      const meta = deriveMeta(resolved, { name, description, tags })
      const ds = await createDataset({ data: meta })
      for (const { cap, expected, metadata } of resolved) {
        await upsertExample({
          data: {
            datasetId: ds.id,
            input: cap.input,
            expected,
            metadata,
            sourceTraceId: cap.sourceTraceId,
            sourceSpanId: cap.sourceSpanId,
          },
        })
      }
      return { added: resolved.length, viewLink: `[open dataset](${origin ?? ''}/datasets/${ds.id})` }
    },
  })

/**
 * Rename / retag a dataset and/or append captured examples.
 */
export const updateDatasetTool = (origin?: string) =>
  tool({
    description:
      'Update an existing dataset: rename, change the description, edit tags, and/or append examples captured from traces or sessions (deduped by source span).',
    inputSchema: z.object({
      datasetId: z.string().describe('Dataset to update (from get_dataset).'),
      name: z.string().optional().describe('New name.'),
      description: z.string().optional(),
      tags: z.array(z.string()).optional().describe('Replace the dataset tags.'),
      addExamples: z.array(exampleEntrySchema).optional().describe('Traces or sessions to append as examples.'),
    }),
    execute: async ({ datasetId, name, description, tags, addExamples }) => {
      if (name !== undefined || description !== undefined || tags !== undefined) {
        await updateDataset({ data: { datasetId, name, description, tags } })
      }
      const resolved = await captureAll(addExamples ?? [])
      for (const { cap, expected, metadata } of resolved) {
        await upsertExample({
          data: {
            datasetId,
            input: cap.input,
            expected,
            metadata,
            sourceTraceId: cap.sourceTraceId,
            sourceSpanId: cap.sourceSpanId,
          },
        })
      }
      return { added: resolved.length, viewLink: `[open dataset](${origin ?? ''}/datasets/${datasetId})` }
    },
  })
