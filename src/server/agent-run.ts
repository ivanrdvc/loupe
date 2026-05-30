// Shared agent caller over the OpenAI-compatible Responses contract loupe speaks.
// Used by the prompts UI and the dataset runner.

export const RUN_TIMEOUT_MS = 60_000

type AgentInputMessage = { role: string; content: string }
type AgentInput = string | AgentInputMessage[]

export type AgentCallInput = {
  endpointUrl: string
  input: AgentInput
  model?: string | null
  conversationId?: string | null
  agentName?: string | null
  sampling?: { temperature?: number | null; maxTokens?: number | null; topP?: number | null }
  timeoutMs?: number
}

export type AgentCallResult = { text: string; durationMs: number; rawJson: string; tokens: number }

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

function extractUsageTokens(raw: unknown): number {
  if (raw == null || typeof raw !== 'object') return 0
  const usage = (raw as Record<string, unknown>).usage
  if (usage == null || typeof usage !== 'object') return 0
  const u = usage as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const total = num(u.total_tokens)
  return total > 0 ? total : num(u.input_tokens) + num(u.output_tokens)
}

export async function callAgent(input: AgentCallInput): Promise<AgentCallResult> {
  const url = parseEndpoint(input.endpointUrl)
  const trimmedAgent = input.agentName?.trim()
  const sampling = input.sampling ?? {}
  const body = {
    model: input.model || 'gpt-4o-mini',
    input: input.input,
    ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
    ...(trimmedAgent ? { metadata: { entity_id: trimmedAgent } } : {}),
    ...(sampling.temperature != null && { temperature: sampling.temperature }),
    ...(sampling.maxTokens != null && { max_output_tokens: sampling.maxTokens }),
    ...(sampling.topP != null && { top_p: sampling.topP }),
  }
  const timeoutMs = input.timeoutMs ?? RUN_TIMEOUT_MS
  const start = performance.now()
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(`Run timed out after ${timeoutMs / 1000}s`)
    }
    throw err
  }
  const durationMs = Math.round(performance.now() - start)
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Run failed (${response.status}): ${errorText || response.statusText}`)
  }
  const raw = (await response.json()) as unknown
  return { text: extractText(raw), durationMs, rawJson: JSON.stringify(raw, null, 2), tokens: extractUsageTokens(raw) }
}
