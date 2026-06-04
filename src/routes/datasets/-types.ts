// Ids are stringified integer PKs; timestamps are epoch ms.

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: ChatRole
  content: string
}

// An example's input is either a single user string or a multi-turn transcript.
export type ExampleInput = string | ChatMessage[]

export interface DatasetExample {
  id: string
  datasetId: string
  input: ExampleInput
  expected: string | null
  metadata: Record<string, string>
  sourceTraceId: string | null
}

/** Single-line preview of an example input (last user turn for transcripts). */
export function inputPreview(input: ExampleInput): string {
  if (typeof input === 'string') return input
  const lastUser = [...input].reverse().find((m) => m.role === 'user')
  return (lastUser ?? input[input.length - 1])?.content ?? ''
}

export function inputTurns(input: ExampleInput): ChatMessage[] | null {
  return typeof input === 'string' ? null : input
}

export type RunItemStatus = 'ok' | 'changed' | 'error' | 'pending'

export interface ItemScore {
  name: string
  pass: boolean | null
  value: number | null
  label: string | null
  explanation: string | null
}

export interface DatasetRunItem {
  runId: string
  exampleId: string
  output: string
  status: RunItemStatus
  latencyMs: number
  tokens: number
  traceId: string | null
  scores: ItemScore[]
  pass: boolean | null
}

export interface DatasetRun {
  id: string
  datasetId: string
  label: string // auto-label, time-based
  createdAt: number // epoch ms
  version: number // dataset version this run was pinned to
  passRate: number | null
}

export interface Dataset {
  id: string
  name: string
  description: string | null
  tags: string[]
  updatedAt: number // epoch ms
  lastRunAt: number | null // epoch ms of the latest run, or null
  version: number
  endpointOverride: string | null
}

export interface DatasetListItem extends Dataset {
  exampleCount: number
  runCount: number
}

export interface DatasetDetail {
  dataset: Dataset
  examples: DatasetExample[]
  runs: DatasetRun[]
  items: DatasetRunItem[]
}

// Fallback when neither a per-dataset override nor an env default is set.
export const GLOBAL_DEFAULT_ENDPOINT = 'http://localhost:8000/v1/responses'

// A client/frontend tool declaration (AG-UI shape), sent so the agent can choose to call it.
export interface ToolDecl {
  name: string
  description?: string
}

export interface AgentOverrides {
  model?: string | null
  temperature?: number | null
  top_p?: number | null
  max_tokens?: number | null
  system_prompt?: string | null
  tools?: ToolDecl[]
}

export interface UpsertExampleInput {
  datasetId: string
  exampleId?: string | null
  input: ExampleInput
  expected?: string | null
  metadata?: Record<string, string>
  sourceTraceId?: string | null
  sourceSpanId?: string | null
}

export interface CreateDatasetInput {
  name: string
  description?: string | null
  tags?: string[]
}
