import type { Message, ModelParams } from '../-types'

export type LiveRunInput = {
  endpointUrl: string
  agentName?: string
  messages: Message[]
  modelParams: ModelParams
  signal?: AbortSignal
}

export type LiveRunOutput = {
  text: string
  durationMs: number
  raw: unknown
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

export async function runLive({
  endpointUrl,
  agentName,
  messages,
  modelParams,
  signal,
}: LiveRunInput): Promise<LiveRunOutput> {
  const start = performance.now()
  const trimmedAgent = agentName?.trim()
  const body = {
    model: modelParams.model || 'gpt-4o-mini',
    input: messages.map((m) => ({ role: m.role, content: m.content })),
    ...(trimmedAgent ? { metadata: { entity_id: trimmedAgent } } : {}),
    ...(modelParams.temperature != null && { temperature: modelParams.temperature }),
    ...(modelParams.maxTokens != null && { max_output_tokens: modelParams.maxTokens }),
    ...(modelParams.topP != null && { top_p: modelParams.topP }),
  }
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const durationMs = Math.round(performance.now() - start)
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Run failed (${response.status}): ${errorText || response.statusText}`)
  }
  const raw = (await response.json()) as unknown
  return { text: extractText(raw), durationMs, raw }
}
