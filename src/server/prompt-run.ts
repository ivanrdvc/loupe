import { createServerFn } from '@tanstack/react-start'
import type { Message, ModelParams } from '#/routes/prompts/-types'

export type RunLiveInput = {
  endpointUrl: string
  agentName?: string | null
  messages: Message[]
  modelParams: ModelParams
}

export type RunLiveOutput = {
  text: string
  durationMs: number
  rawJson: string
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

export const runLivePrompt = createServerFn({ method: 'POST' })
  .inputValidator((input: RunLiveInput) => ({
    endpointUrl: String(input.endpointUrl),
    agentName: input.agentName == null ? null : String(input.agentName),
    messages: Array.isArray(input.messages) ? input.messages : [],
    modelParams: input.modelParams ?? { model: '' },
  }))
  .handler(async ({ data }): Promise<RunLiveOutput> => {
    const start = performance.now()
    const trimmedAgent = data.agentName?.trim()
    const body = {
      model: data.modelParams.model || 'gpt-4o-mini',
      input: data.messages.map((m) => ({ role: m.role, content: m.content })),
      ...(trimmedAgent ? { metadata: { entity_id: trimmedAgent } } : {}),
      ...(data.modelParams.temperature != null && { temperature: data.modelParams.temperature }),
      ...(data.modelParams.maxTokens != null && { max_output_tokens: data.modelParams.maxTokens }),
      ...(data.modelParams.topP != null && { top_p: data.modelParams.topP }),
    }
    const response = await fetch(data.endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const durationMs = Math.round(performance.now() - start)
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      throw new Error(`Run failed (${response.status}): ${errorText || response.statusText}`)
    }
    const raw = (await response.json()) as unknown
    return { text: extractText(raw), durationMs, rawJson: JSON.stringify(raw, null, 2) }
  })
