import { tokensFromChars } from '#/lib/format'
import { formatJson, type JsonValue } from '#/lib/json'
import type { Span } from '#/lib/spans'
import { asMessages, type MessagePart } from '#/lib/spans/conversation'
import { isAgentSpan, isChatSpan } from './predicates'

export interface AguiItem {
  id: string
  label: string
  value: string
  tokens: number
}

export function collectSystemAndAgui(
  spans: Span[],
  childrenByParent: Map<string | null, Span[]>,
): { systemPromptByAgent: Map<string, string>; aguiItems: AguiItem[] } {
  const aguiItems: AguiItem[] = []
  const seenAgui = new Set<string>()

  // Gate on the explicit `ag_ui.thread_id`, not the generic `sessionId` (which
  // can be a non-AG-UI value like an OpenAI `resp_…` id).
  const threadIds = new Set<string>()
  for (const s of spans) if (s.agUiThreadId) threadIds.add(s.agUiThreadId)
  for (const id of threadIds) {
    aguiItems.push({ id: `thread-${id}`, label: 'Session / thread id', value: id, tokens: tokensFromChars(id.length) })
  }

  // Details panel reads the first system message (any kind) — AG-UI items
  // only get the classified-as-agui subset.
  const firstSystemByChat = new Map<string, string>()
  for (const span of spans) {
    if (!isChatSpan(span)) continue
    for (const msg of asMessages(span.llmInput)) {
      if (msg.role !== 'system') continue
      const content = textOf(msg.parts).trim()
      if (!content) continue
      const kind = classifySystemContent(content)
      if (kind === 'prompt' && !firstSystemByChat.has(span.id)) {
        firstSystemByChat.set(span.id, content)
      }
      if (kind === 'agui') {
        if (seenAgui.has(content)) continue
        seenAgui.add(content)
        aguiItems.push({
          id: `${span.id}-sys-${aguiItems.length}`,
          label: aguiLabelFor(content),
          value: content,
          tokens: tokensFromChars(content.length),
        })
      }
    }
    for (const hit of findAguiValues(span.llmInput)) {
      const key = `${hit.label}:${hit.value}`
      if (seenAgui.has(key)) continue
      seenAgui.add(key)
      aguiItems.push({
        id: `${span.id}-${aguiItems.length}`,
        label: hit.label,
        value: hit.value,
        tokens: tokensFromChars(hit.value.length),
      })
    }
  }

  const systemPromptByAgent = new Map<string, string>()
  for (const agent of spans) {
    if (!isAgentSpan(agent)) continue
    // Prefer the agent's own `gen_ai.system_instructions` (MAF); fall back to
    // any descendant chat's copy, then to llm_input system messages.
    if (agent.systemInstructions) {
      systemPromptByAgent.set(agent.id, agent.systemInstructions)
      continue
    }
    const chats: Span[] = []
    const walk = (pid: string) => {
      for (const c of childrenByParent.get(pid) ?? []) {
        if (isChatSpan(c)) chats.push(c)
        walk(c.id)
      }
    }
    walk(agent.id)
    chats.sort((a, b) => a.startMs - b.startMs)
    for (const c of chats) {
      const prompt = c.systemInstructions ?? firstSystemByChat.get(c.id)
      if (prompt) {
        systemPromptByAgent.set(agent.id, prompt)
        break
      }
    }
  }

  return { systemPromptByAgent, aguiItems }
}

export function isShortValue(value: string): boolean {
  return !value.includes('\n') && value.length < 120
}

function textOf(parts: MessagePart[]): string {
  return parts
    .filter((p): p is Extract<MessagePart, { kind: 'text' }> => p.kind === 'text')
    .map((p) => p.content)
    .join('\n\n')
}

function classifySystemContent(content: string): 'prompt' | 'agui' {
  const trimmed = content.trim()
  if (!trimmed) return 'prompt'
  if (/^[{[]/.test(trimmed)) return 'agui'
  if (/\b(current state|new state|state changes|state in json|state update|summary of the state)\b/i.test(trimmed)) {
    return 'agui'
  }
  return 'prompt'
}

function aguiLabelFor(content: string): string {
  const trimmed = content.trim()
  if (/^[{[]/.test(trimmed)) return 'State payload'
  if (/\b(summary of the state|summarize)\b/i.test(trimmed)) return 'Summarize directive'
  if (/\b(new state|state changes|state update)\b/i.test(trimmed)) return 'State update directive'
  if (/\b(current state|state in json)\b/i.test(trimmed)) return 'State directive'
  return 'Directive'
}

function findAguiValues(value: JsonValue | undefined, path: string[] = []): { label: string; value: string }[] {
  if (value == null) return []
  if (typeof value !== 'object') {
    const label = path.join('.')
    if (/(^|\.)(ag_ui|agui|thread|runtime|context|state)(\.|$)/i.test(label)) {
      return [{ label, value: String(value) }]
    }
    return []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findAguiValues(item, [...path, String(index)]))
  }
  return Object.entries(value).flatMap(([key, child]) => {
    const nextPath = [...path, key]
    return /(ag_ui|agui|thread|runtime|context|state)/i.test(key)
      ? [{ label: nextPath.join('.'), value: formatJson(child) }]
      : findAguiValues(child, nextPath)
  })
}
