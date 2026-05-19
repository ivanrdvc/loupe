import { asMessages, type ChatMessage } from './conversation'
import type { JsonValue } from './json'
import type { Span } from './spans'

export type SpanInput = Pick<
  Span,
  'model' | 'llmInput' | 'inputTokens' | 'outputTokens' | 'cachedTokens' | 'toolDefinitions'
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

export async function resolveEncoder(model: string | undefined): Promise<ResolvedEncoder> {
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
  const messages = asMessages(span.llmInput)
  const systemMsgs = messages.filter((m) => m.role === 'system')
  const otherMsgs = messages.filter((m) => m.role !== 'system')
  const systemTokens = countMessages(systemMsgs, enc)
  const messagesTokens = countMessages(otherMsgs, enc)
  const inputTokens = span.inputTokens ?? 0
  const toolDefsTokens = Math.max(0, inputTokens - systemTokens - messagesTokens)
  return {
    systemTokens,
    toolDefsTokens,
    toolDefsCount: toolDefsCount(span.toolDefinitions),
    messagesTokens,
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
