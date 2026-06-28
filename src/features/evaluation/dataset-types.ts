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
  agentLabel: string | null // saved agent this run hit, or null for a custom URL
  identityLabel: string | null // dev-user this run was fired as, or null
  config: AgentOverrides | null // the overrides this run used; null = agent defaults
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

/** Short chips describing a run's config (empty = agent defaults). Reused for the sheet summary and run labels. */
export function configSummary(config: AgentOverrides | null | undefined): string[] {
  if (!config) return []
  const bits: string[] = []
  if (config.model) bits.push(config.model)
  if (config.temperature != null) bits.push(`temp ${config.temperature}`)
  if (config.top_p != null) bits.push(`top_p ${config.top_p}`)
  if (config.max_tokens != null) bits.push(`${config.max_tokens} tok`)
  if (config.system_prompt) bits.push('custom system')
  const tools = config.tools?.filter((t) => t.name.trim()) ?? []
  if (tools.length) bits.push(`${tools.length} tool${tools.length === 1 ? '' : 's'}`)
  return bits
}

/** Strip empty fields so a run stores only the overrides that actually applied (or null). */
export function compactOverrides(ov: AgentOverrides | null | undefined): AgentOverrides | null {
  if (!ov) return null
  const out: AgentOverrides = {}
  if (ov.model) out.model = ov.model
  if (ov.temperature != null) out.temperature = ov.temperature
  if (ov.top_p != null) out.top_p = ov.top_p
  if (ov.max_tokens != null) out.max_tokens = ov.max_tokens
  if (ov.system_prompt) out.system_prompt = ov.system_prompt
  const tools = ov.tools?.filter((t) => t.name.trim())
  if (tools?.length) out.tools = tools
  return Object.keys(out).length ? out : null
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
// Wire protocol an adapter speaks to the agent under test. Add a protocol in agent-run.ts.
export type AgentProtocol = 'openai-responses' | 'vercel-ai-stream'

export interface AgentTargetConfig {
  adapter?: AgentProtocol // wire protocol to the agent; default 'openai-responses'
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
