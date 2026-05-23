import type { Span } from './spans'

// One Turn = one top-level invoke_agent run = one user message exchange.
// A run can fire multiple LLM calls internally (tool-call cycles where the
// first chat finishes with `tool_calls` and the next chat carries the tool
// result back to the model), but those are implementation detail — the user
// sees one assistant response per turn.
//
// `chats` is the orchestrator's own LLM calls (direct children) — used to
// reconstruct the visible assistant turns. `subagentChats` is every chat
// fired by a sub-agent invoked from this turn. `turnTotals` sums across
// both, so per-turn token/cost numbers reflect the full work done to
// produce the assistant's response.
export interface Turn {
  run: Span
  chats: Span[]
  subagentChats: Span[]
  actions: Span[]
}

export function extractTurns(spans: Span[], orchestratorIds: string | string[]): Turn[] {
  const ids = new Set(Array.isArray(orchestratorIds) ? orchestratorIds : [orchestratorIds])
  if (ids.size === 0) return []
  const byId = new Map(spans.map((s) => [s.id, s]))
  const byParent = new Map<string | null, Span[]>()
  for (const s of spans) {
    const arr = byParent.get(s.parentId) ?? []
    arr.push(s)
    byParent.set(s.parentId, arr)
  }
  const turns: Turn[] = []
  for (const orchId of ids) {
    const run = byId.get(orchId)
    if (!run) continue
    const chats: Span[] = []
    const subagentChats: Span[] = []
    const actions: Span[] = []
    // Walk the orchestrator subtree once. Direct chats → `chats`; chats
    // deeper in the tree (under a tool, subagent, or chain of subagents) →
    // `subagentChats`. Top-level tools/invoke_agent siblings → `actions`.
    const walk = (parentId: string, depth: number) => {
      for (const s of byParent.get(parentId) ?? []) {
        if (s.operation === 'chat') {
          if (depth === 0) chats.push(s)
          else subagentChats.push(s)
        } else if (depth === 0 && (s.operation === 'tool' || s.operation === 'invoke_agent')) {
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

export interface TurnTotals {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  costUsd: number
  durationMs: number
  model: string | undefined
}

export function turnTotals(turn: Turn): TurnTotals {
  let inputTokens = 0
  let outputTokens = 0
  let cachedTokens = 0
  let costUsd = 0
  const accumulate = (c: Span) => {
    inputTokens += c.inputTokens ?? 0
    outputTokens += c.outputTokens ?? 0
    cachedTokens += c.cachedTokens ?? 0
    costUsd += c.costUsd ?? 0
  }
  for (const c of turn.chats) accumulate(c)
  for (const c of turn.subagentChats) accumulate(c)
  const durationMs = Math.max(0, turn.run.endMs - turn.run.startMs)
  // Final orchestrator chat wins on model — if the agent swapped models
  // mid-run (rare), the user cares about which one produced the visible
  // answer. Subagent models are intentionally ignored here.
  const model = turn.chats[turn.chats.length - 1]?.model
  return { inputTokens, outputTokens, cachedTokens, costUsd, durationMs, model }
}
