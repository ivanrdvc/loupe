// AG-UI / CopilotKit emit machinery messages between real conversation turns:
// state-sync system prompts, JSON state dumps the model echoes back, "please
// summarize the state changes" prompts. They're not part of the user-visible
// chat — they exist so the framework can keep its in-process state in sync
// with the LLM. We fold consecutive scaffolding messages into one accordion
// so the real conversation reads cleanly.
//
// Rules:
//   - Every system message counts as scaffold.
//   - An assistant message counts as scaffold only if a scaffold run is
//     already open AND its content is pure JSON — that's the model echoing
//     state back. A prose assistant reply (e.g. the "concise summary" the
//     framework asks for) is the model's real answer and stays visible.
//   - A run of just one scaffold message (e.g. the agent's initial system
//     prompt with no AG-UI cycle around it) renders inline as a normal
//     bubble. Two or more become an accordion.
//
// This file is pure — no React. Renderer lives in
// `src/components/scaffold-group.tsx`.

import type { ConversationEvent } from './conversation'

export type ScaffoldMessage = Extract<ConversationEvent, { kind: 'message' }> & {
  role: 'system' | 'assistant'
}

export type RenderItem =
  | { kind: 'event'; event: ConversationEvent }
  | { kind: 'scaffold_group'; messages: ScaffoldMessage[] }

export function groupScaffolding(events: ConversationEvent[]): RenderItem[] {
  const items: RenderItem[] = []
  let buffer: ScaffoldMessage[] = []
  const flush = () => {
    if (buffer.length === 0) return
    if (buffer.length === 1) items.push({ kind: 'event', event: buffer[0] })
    else items.push({ kind: 'scaffold_group', messages: buffer })
    buffer = []
  }
  for (const e of events) {
    if (e.kind === 'message' && e.role === 'system') {
      buffer.push(e as ScaffoldMessage)
      continue
    }
    if (e.kind === 'message' && isScaffoldAssistant(e, buffer)) {
      buffer.push(e as ScaffoldMessage)
      continue
    }
    flush()
    items.push({ kind: 'event', event: e })
  }
  flush()
  return items
}

function isScaffoldAssistant(
  event: Extract<ConversationEvent, { kind: 'message' }>,
  buffer: ScaffoldMessage[],
): boolean {
  if (event.role !== 'assistant') return false
  if (buffer.length === 0) return false
  return isPureJson(event.content)
}

function isPureJson(content: string): boolean {
  const trimmed = content.trim()
  if (!/^[{[]/.test(trimmed)) return false
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

// Heuristic for the accordion's badge: does this group look like AG-UI
// state-sync (purple "ag-ui" pill, "State sync" label) or generic system
// context (neutral styling)? We tag the group AG-UI when most messages match
// known state-sync content shapes.
export function looksLikeAgui(m: ScaffoldMessage): boolean {
  if (m.role === 'assistant') return isPureJson(m.content)
  const trimmed = m.content.trim()
  if (/^[{[]/.test(trimmed)) return true
  return /\b(current state|new state|state changes|state in json|state update|summary of the state|concise summary)\b/i.test(
    trimmed,
  )
}
