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
  sourceSpanId: string | null
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
  errorText: string | null
  scores: ItemScore[]
}

export interface DatasetRun {
  id: string
  datasetId: string
  label: string // auto-label, time-based
  createdAt: number // epoch ms
  version: number // dataset version this run was pinned to
  passRate: number | null
  identityLabel: string | null // dev-user this run was fired as, or null
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

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

// A saved agent under test. `config` holds the static auth handshake; an identity adds
// credentials on top. Opaque to core's schema (fork-safe).
export interface AgentTargetConfig {
  authEndpoint?: string // omitted = no auth / static-header-only
  tokenPath?: string // dot-path into the mint response (default 'access_token')
  headers?: Record<string, string>
  [key: string]: JsonValue | undefined
}

export interface AgentTarget {
  id: string
  label: string
  endpointUrl: string
  config: AgentTargetConfig
}

export type AgentTargetSummary = Pick<AgentTarget, 'id' | 'label' | 'endpointUrl'>

export interface UpsertAgentTargetInput {
  id?: string | null
  label: string
  endpointUrl: string
  config: AgentTargetConfig
}

// A dev-user. Normally just `credentials`; the handshake comes from the target. The rest
// are overrides set only in Full-config mode.
export interface AgentIdentityConfig {
  credentials?: Record<string, JsonValue> // mint request body (e.g. { username, password })
  entityId?: string // sent as metadata.entity_id — the dev user the agent routes as
  authEndpoint?: string
  tokenPath?: string
  headers?: Record<string, string>
  [key: string]: JsonValue | undefined
}

export interface AgentIdentity {
  id: string
  label: string
  config: AgentIdentityConfig
}

export interface AgentIdentitySummary {
  id: string
  label: string
  username?: string
}

export interface UpsertAgentIdentityInput {
  id?: string | null
  label: string
  config: AgentIdentityConfig
}
