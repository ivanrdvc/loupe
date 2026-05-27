import { asMessages, type ChatMessage } from './conversation'
import type { JsonValue } from './json'
import type { Span } from './spans'

export type SpanInput = Pick<
  Span,
  'model' | 'llmInput' | 'inputTokens' | 'outputTokens' | 'cachedTokens' | 'toolDefinitions' | 'systemInstructions'
>

export interface ChatBreakdown {
  systemTokens: number
  toolDefsTokens: number
  toolDefsCount: number
  messagesTokens: number
  cachedTokens: number
  inputTokens: number
  outputTokens: number
}

type Encoder = (text: string) => number

type Family = 'openai-o200k' | 'openai-cl100k' | 'anthropic'

interface ResolvedEncoder {
  family: Family
  count: Encoder
}

const encoderCache = new Map<Family, Promise<Encoder>>()

function resolveFamily(model: string | undefined): Family {
  const m = (model ?? '').toLowerCase()
  if (m.startsWith('claude') || m.includes('anthropic')) return 'anthropic'
  if (
    m.startsWith('gpt-4o') ||
    m.startsWith('chatgpt-4o') ||
    m.startsWith('gpt-4.1') ||
    m.startsWith('gpt-4.5') ||
    m.startsWith('gpt-5') ||
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4') ||
    m.startsWith('codex')
  ) {
    return 'openai-o200k'
  }
  return 'openai-cl100k'
}

async function loadEncoder(family: Family): Promise<Encoder> {
  const cached = encoderCache.get(family)
  if (cached) return cached
  const p = (async (): Promise<Encoder> => {
    if (family === 'openai-o200k') {
      const mod = await import('gpt-tokenizer/encoding/o200k_base')
      return (text: string) => mod.encode(text).length
    }
    if (family === 'openai-cl100k') {
      const mod = await import('gpt-tokenizer/encoding/cl100k_base')
      return (text: string) => mod.encode(text).length
    }
    // TODO: restore accurate Anthropic tokenizer — @anthropic-ai/tokenizer pulled tiktoken (WASM)
    // which is incompatible with Vite 8 / rolldown client builds
    return () => 0
  })()
  encoderCache.set(family, p)
  return p
}

async function resolveEncoder(model: string | undefined): Promise<ResolvedEncoder> {
  const family = resolveFamily(model)
  const count = await loadEncoder(family)
  return { family, count }
}

function partText(parts: ChatMessage['parts']): string {
  const out: string[] = []
  for (const p of parts) {
    if (p.kind === 'text') out.push(p.content)
    else if (p.kind === 'tool_call') out.push(p.name, JSON.stringify(p.arguments ?? null))
    else if (p.kind === 'tool_call_response') out.push(JSON.stringify(p.response ?? null))
  }
  return out.join('\n')
}

function countMessages(messages: ChatMessage[], enc: ResolvedEncoder): number {
  if (messages.length === 0) return 0
  let total = 0
  for (const msg of messages) {
    total += enc.count(msg.role)
    total += enc.count(partText(msg.parts))
    if (enc.family !== 'anthropic') total += 4
  }
  if (enc.family !== 'anthropic') total += 3
  return total
}

function toolDefsCount(defs: JsonValue | undefined): number {
  if (defs === undefined || defs === null) return 0
  return Array.isArray(defs) ? defs.length : 1
}

export async function breakdownChat(span: SpanInput): Promise<ChatBreakdown> {
  const enc = await resolveEncoder(span.model)
  const inputTokens = span.inputTokens ?? 0

  // --- Compute systemTokens ---
  // Prefer direct tokenization of systemInstructions when present (survives
  // even when llmInput is absent or truncated). Fall back to counting the
  // system role messages inside llmInput.
  const messages = asMessages(span.llmInput)
  const systemMsgs = messages.filter((m) => m.role === 'system')
  const otherMsgs = messages.filter((m) => m.role !== 'system')
  const systemTokensFromInput = countMessages(systemMsgs, enc)
  const systemTokensFromAttr = span.systemInstructions ? enc.count(span.systemInstructions) : 0
  const systemTokens = Math.max(systemTokensFromInput, systemTokensFromAttr)

  // --- Compute toolDefsTokens ---
  // When the raw definitions are available, tokenize them directly — far more
  // accurate than the residual approach and works even without llmInput.
  const toolDefsTokens = span.toolDefinitions != null ? enc.count(JSON.stringify(span.toolDefinitions)) : null // signals "use residual below"

  // --- messagesTokens and toolDefsTokens (residual logic) ---
  // • If llmInput is present: messagesTokens = direct count; toolDefsTokens = residual if not computed above.
  // • If llmInput is absent but toolDefs are present: toolDefsTokens = direct count; messagesTokens = residual.
  // • If neither: everything collapses into the residual bucket (toolDefsTokens) — caller should hide the bar.
  const messagesTokensFromInput = countMessages(otherMsgs, enc)

  let finalToolDefs: number
  let finalMessages: number

  if (toolDefsTokens !== null && span.llmInput != null) {
    // Best case: have both. Trust direct counts.
    finalToolDefs = toolDefsTokens
    finalMessages = messagesTokensFromInput
  } else if (toolDefsTokens !== null) {
    // Have tool defs but no llmInput — messages is the residual.
    finalToolDefs = toolDefsTokens
    finalMessages = Math.max(0, inputTokens - systemTokens - toolDefsTokens)
  } else {
    // No tool defs — fall back to original residual approach.
    finalToolDefs = Math.max(0, inputTokens - systemTokens - messagesTokensFromInput)
    finalMessages = messagesTokensFromInput
  }

  return {
    systemTokens,
    toolDefsTokens: finalToolDefs,
    toolDefsCount: toolDefsCount(span.toolDefinitions),
    messagesTokens: finalMessages,
    cachedTokens: span.cachedTokens ?? 0,
    inputTokens,
    outputTokens: span.outputTokens ?? 0,
  }
}

export function emptyBreakdown(): ChatBreakdown {
  return {
    systemTokens: 0,
    toolDefsTokens: 0,
    toolDefsCount: 0,
    messagesTokens: 0,
    cachedTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
  }
}

export function sumBreakdowns(items: ChatBreakdown[]): ChatBreakdown {
  const sum = emptyBreakdown()
  for (const b of items) {
    sum.systemTokens += b.systemTokens
    sum.toolDefsTokens += b.toolDefsTokens
    sum.toolDefsCount += b.toolDefsCount
    sum.messagesTokens += b.messagesTokens
    sum.cachedTokens += b.cachedTokens
    sum.inputTokens += b.inputTokens
    sum.outputTokens += b.outputTokens
  }
  return sum
}
