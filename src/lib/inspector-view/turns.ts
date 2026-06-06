import type { Span } from '#/lib/spans'
import { isAgentSpan, isChatSpan, isToolLike } from './predicates'

// One Turn = one top-level invoke_agent run = one user message exchange.
// `chats` are direct chat children (visible assistant turns); `subagentChats`
// are chats fired anywhere deeper in the tree (sub-agents, tool callbacks).
export interface Turn {
  run: Span
  chats: Span[]
  subagentChats: Span[]
  actions: Span[]
}

export interface TurnTotals {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  costUsd: number
  durationMs: number
  model: string | undefined
}

export function buildTurns(
  orchestratorIds: string[],
  childrenByParent: Map<string | null, Span[]>,
  byId: Map<string, Span>,
): Turn[] {
  if (orchestratorIds.length === 0) return []
  const turns: Turn[] = []
  for (const orchId of orchestratorIds) {
    const run = byId.get(orchId)
    if (!run) continue
    const chats: Span[] = []
    const subagentChats: Span[] = []
    const actions: Span[] = []
    const walk = (parentId: string, depth: number) => {
      for (const s of childrenByParent.get(parentId) ?? []) {
        if (isChatSpan(s)) {
          if (depth === 0) chats.push(s)
          else subagentChats.push(s)
        } else if (depth === 0 && (isToolLike(s) || isAgentSpan(s))) {
          actions.push(s)
        }
        walk(s.id, depth + 1)
      }
    }
    walk(orchId, 0)
    chats.sort((a, b) => a.startMs - b.startMs)
    subagentChats.sort((a, b) => a.startMs - b.startMs)
    actions.sort((a, b) => a.startMs - b.startMs)
    turns.push({ run, chats, subagentChats, actions })
  }
  return turns.sort((a, b) => a.run.startMs - b.run.startMs)
}

export function turnTotals(turn: Turn): TurnTotals {
  let inputTokens = 0
  let outputTokens = 0
  let cachedTokens = 0
  let costUsd = 0
  for (const c of turn.chats) {
    inputTokens += c.inputTokens ?? 0
    outputTokens += c.outputTokens ?? 0
    cachedTokens += c.cachedTokens ?? 0
    costUsd += c.costUsd ?? 0
  }
  for (const c of turn.subagentChats) {
    inputTokens += c.inputTokens ?? 0
    outputTokens += c.outputTokens ?? 0
    cachedTokens += c.cachedTokens ?? 0
    costUsd += c.costUsd ?? 0
  }
  const durationMs = Math.max(0, turn.run.endMs - turn.run.startMs)
  // Final orchestrator chat wins on model — what produced the user-visible answer.
  const model = turn.chats.at(-1)?.model
  return { inputTokens, outputTokens, cachedTokens, costUsd, durationMs, model }
}
