// Shared agent caller over the OpenAI-compatible Responses contract loupe speaks.
// Used by the dataset runner.
import type { AgentProtocol } from '../dataset-types'

type AgentInputMessage = { role: string; content: string }
type AgentInput = string | AgentInputMessage[]

export type AgentCallInput = {
  endpointUrl: string
  input: AgentInput
  model?: string | null
  conversationId?: string | null
  agentName?: string | null
  instructions?: string | null
  tools?: { name: string; description?: string }[]
  sampling?: { temperature?: number | null; maxTokens?: number | null; topP?: number | null }
  // Merged over Content-Type. callAgent stays auth-dumb — mint/refresh/retry live in the runner.
  headers?: Record<string, string>
}

// Carries the HTTP status so the runner can re-mint once on a 401.
export class AgentCallError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AgentCallError'
    this.status = status
  }
}

// Replace token/credential values with [REDACTED] before anything is persisted to dev.db.
export function redactSecrets(text: string, secrets: Array<string | undefined>): string {
  let out = text
  for (const s of secrets) if (s) out = out.split(s).join('[REDACTED]')
  return out
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/("?authorization"?\s*[:=]\s*")([^"]*)(")/gi, '$1[REDACTED]$3')
}

export type AgentCallResult = {
  text: string
  durationMs: number
  rawJson: string
  tokens: number
  inputTokens: number | null
  outputTokens: number | null
}

function parseEndpoint(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('Endpoint must be a valid absolute URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Endpoint must use http or https')
  }
  return url
}

function extractText(raw: unknown): string {
  if (raw == null || typeof raw !== 'object') return ''
  const obj = raw as Record<string, unknown>
  if (typeof obj.output_text === 'string') return obj.output_text
  const output = obj.output
  if (!Array.isArray(output)) return ''
  const parts: string[] = []
  for (const item of output) {
    if (item == null || typeof item !== 'object') continue
    const it = item as Record<string, unknown>
    if (it.type !== 'message') continue
    const content = it.content
    if (!Array.isArray(content)) continue
    for (const c of content) {
      if (c == null || typeof c !== 'object') continue
      const cc = c as Record<string, unknown>
      if ((cc.type === 'output_text' || cc.type === 'text') && typeof cc.text === 'string') {
        parts.push(cc.text)
      }
    }
  }
  return parts.join('\n')
}

function extractUsage(raw: unknown): { input: number | null; output: number | null; total: number } {
  if (raw == null || typeof raw !== 'object') return { input: null, output: null, total: 0 }
  const usage = (raw as Record<string, unknown>).usage
  if (usage == null || typeof usage !== 'object') return { input: null, output: null, total: 0 }
  const u = usage as Record<string, unknown>
  const opt = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const num = (v: unknown) => opt(v) ?? 0
  const input = opt(u.input_tokens) ?? opt(u.prompt_tokens)
  const output = opt(u.output_tokens) ?? opt(u.completion_tokens)
  const totalReported = num(u.total_tokens)
  return { input, output, total: totalReported > 0 ? totalReported : num(input) + num(output) }
}

const DEFAULT_PROTOCOL: AgentProtocol = 'openai-responses'

export async function callAgent(input: AgentCallInput): Promise<AgentCallResult> {
  const url = parseEndpoint(input.endpointUrl)
  const trimmedAgent = input.agentName?.trim()
  const sampling = input.sampling ?? {}
  const body = {
    model: input.model || 'gpt-4o-mini',
    input: input.input,
    ...(input.instructions ? { instructions: input.instructions } : {}),
    ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
    ...(trimmedAgent ? { metadata: { entity_id: trimmedAgent } } : {}),
    ...(sampling.temperature != null && { temperature: sampling.temperature }),
    ...(sampling.maxTokens != null && { max_output_tokens: sampling.maxTokens }),
    ...(sampling.topP != null && { top_p: sampling.topP }),
    ...(input.tools?.length
      ? {
          tools: input.tools.map((t) => ({
            type: 'function',
            name: t.name,
            description: t.description ?? '',
            parameters: { type: 'object', properties: {} },
          })),
        }
      : {}),
  }
  const start = performance.now()
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...input.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('Run timed out after 60s')
    }
    throw new Error(err instanceof Error ? err.message : 'Network error')
  }
  const durationMs = Math.round(performance.now() - start)
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new AgentCallError(`Run failed (${response.status}): ${errorText || response.statusText}`, response.status)
  }
  const raw = (await response.json()) as unknown
  const usage = extractUsage(raw)
  return {
    text: extractText(raw),
    durationMs,
    rawJson: JSON.stringify(raw, null, 2),
    tokens: usage.total,
    inputTokens: usage.input,
    outputTokens: usage.output,
  }
}

function toUIMessages(input: AgentInput): unknown[] {
  const msgs = typeof input === 'string' ? [{ role: 'user', content: input }] : input
  return msgs.map((m, i) => ({
    id: `m${i}`,
    role: m.role === 'assistant' || m.role === 'system' ? m.role : 'user',
    parts: [{ type: 'text', text: m.content }],
  }))
}

async function accumulateTextDeltas(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let streamError: string | undefined
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    for (;;) {
      const nl = buffer.indexOf('\n')
      if (nl === -1) break
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const evt = JSON.parse(payload) as { type?: string; delta?: string; errorText?: string }
        if (evt.type === 'text-delta' && typeof evt.delta === 'string') text += evt.delta
        // The agent reports tool/model failures as an error part, not an HTTP status — surface it.
        else if (evt.type === 'error') streamError = evt.errorText || 'agent stream error'
      } catch {
        // keepalive / partial line — ignore
      }
    }
  }
  if (streamError) throw new AgentCallError(`Run failed: ${streamError}`)
  return text
}

// AI SDK UI-message stream (loupe's own /api/chat). Usage isn't in the stream — recover it from
// OTel later. conversationId → sessionId so trace linkage resolves.
export async function callVercelAiStream(input: AgentCallInput): Promise<AgentCallResult> {
  const url = parseEndpoint(input.endpointUrl)
  const body = {
    messages: toUIMessages(input.input),
    ...(input.model ? { model: input.model } : {}),
    ...(input.conversationId ? { sessionId: input.conversationId } : {}),
  }
  const start = performance.now()
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...input.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') throw new Error('Run timed out after 60s')
    throw new Error(err instanceof Error ? err.message : 'Network error')
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new AgentCallError(`Run failed (${response.status}): ${errorText || response.statusText}`, response.status)
  }
  const text = await accumulateTextDeltas(response)
  return {
    text,
    durationMs: Math.round(performance.now() - start),
    rawJson: '',
    tokens: 0,
    inputTokens: null,
    outputTokens: null,
  }
}

// One protocol per adapter; all share AgentCallInput → AgentCallResult. Add one = function + entry.
export type AgentAdapter = (input: AgentCallInput) => Promise<AgentCallResult>

const ADAPTERS: Record<AgentProtocol, AgentAdapter> = {
  'openai-responses': callAgent,
  'vercel-ai-stream': callVercelAiStream,
}

export function resolveAdapter(key: string | null | undefined): AgentAdapter {
  return (key && ADAPTERS[key as AgentProtocol]) || ADAPTERS[DEFAULT_PROTOCOL]
}
