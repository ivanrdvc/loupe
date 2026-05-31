import type { Span } from '#/lib/spans'
import { buildConversation, type ConversationEvent } from '#/lib/spans/conversation'
import { isAgentSpan, isChatSpan, spanHasError } from './predicates'
import { type AguiItem, collectSystemAndAgui } from './system'
import {
  collectFrontendTools,
  collectToolGroups,
  type FrontendTool,
  resolveToolCalls,
  type ToolCallResolution,
  type ToolGroup,
} from './tools'
import { buildTurns, type Turn, turnTotals } from './turns'

export type { ConversationEvent } from '#/lib/spans/conversation'
export { isChatSpan, isCollapsibleInfra, isToolLike, spanHasError } from './predicates'
export { isShortValue } from './system'
export type { FrontendTool, ToolCallResolution, ToolDef, ToolGroup } from './tools'
export type { Turn } from './turns'
export { turnTotals } from './turns'

interface InspectorTotals {
  input: number
  output: number
  cached: number
  cost: number
  durationMs: number
  errors: number
}

export interface InspectorView {
  spans: Span[]
  byId: Map<string, Span>
  childrenByParent: Map<string | null, Span[]>

  agentLabels: Map<string, string>
  orchestratorIds: string[]

  turns: Turn[]
  totals: InspectorTotals
  // Already folded into `totals`; tracked separately only for the breakdown
  // bar's `subagent` segment. Don't double-count.
  subagentChatTokens: number

  orchestratorChats: Span[]
  allChats: Span[]

  conversation: ConversationEvent[]
  callResolutions: Map<string, ToolCallResolution>

  toolGroups: ToolGroup[]
  frontendTools: FrontendTool[]
  systemPromptByAgent: Map<string, string>
  aguiItems: AguiItem[]

  descendantsOf(id: string): Span[]
  toolGroupsFor(span: Span | undefined): ToolGroup[]
  descendantErrors(id: string, max?: number): Span[]
}

// Build once per `spans[]`; memoise at the route/drawer host.
export function buildInspectorView(spans: Span[]): InspectorView {
  const byId = new Map<string, Span>()
  const childrenByParent = new Map<string | null, Span[]>()
  for (const s of spans) {
    byId.set(s.id, s)
    const arr = childrenByParent.get(s.parentId) ?? []
    arr.push(s)
    childrenByParent.set(s.parentId, arr)
  }

  const descendantsOf = (id: string): Span[] => {
    const out: Span[] = []
    const walk = (pid: string) => {
      for (const c of childrenByParent.get(pid) ?? []) {
        out.push(c)
        walk(c.id)
      }
    }
    walk(id)
    return out
  }

  const agentLabels = buildAgentLabels(spans)
  const orchestratorIds = spans
    .filter((s) => isAgentSpan(s) && !s.taskParentId)
    .sort((a, b) => a.startMs - b.startMs)
    .map((s) => s.id)

  const turns = buildTurns(orchestratorIds, childrenByParent, byId)

  let totalInput = 0
  let totalOutput = 0
  let totalCached = 0
  let totalCost = 0
  let totalDuration = 0
  let totalErrors = 0
  let subagentChatTokens = 0
  for (const turn of turns) {
    const t = turnTotals(turn)
    totalInput += t.inputTokens
    totalOutput += t.outputTokens
    totalCached += t.cachedTokens
    totalCost += t.costUsd
    totalDuration += t.durationMs
    for (const a of turn.actions) if (spanHasError(a)) totalErrors += 1
    for (const c of turn.subagentChats) {
      subagentChatTokens += (c.inputTokens ?? 0) + (c.outputTokens ?? 0)
    }
  }

  const orchestratorChats = turns.flatMap((t) => t.chats)
  const allChats = spans.filter(isChatSpan)

  const callResolutions = resolveToolCalls(spans, childrenByParent)
  let conversationCache: ConversationEvent[] | undefined
  const toolGroups = collectToolGroups(spans)
  const frontendTools = collectFrontendTools(spans)
  const { systemPromptByAgent, aguiItems } = collectSystemAndAgui(spans, childrenByParent)

  const toolGroupsFor = (span: Span | undefined): ToolGroup[] => {
    if (!span) return toolGroups
    if (isAgentSpan(span)) return collectToolGroups([span, ...descendantsOf(span.id)])
    if (isChatSpan(span)) return collectToolGroups([span])
    return toolGroups
  }

  const descendantErrors = (id: string, max = 5): Span[] => {
    const out: Span[] = []
    const queue: string[] = [id]
    const visited = new Set<string>([id])
    while (queue.length > 0 && out.length < max) {
      const pid = queue.shift() as string
      for (const child of childrenByParent.get(pid) ?? []) {
        if (visited.has(child.id)) continue
        visited.add(child.id)
        if (child.errorType || child.errorMessage) out.push(child)
        queue.push(child.id)
      }
    }
    return out
  }

  return {
    spans,
    byId,
    childrenByParent,
    agentLabels,
    orchestratorIds,
    turns,
    totals: {
      input: totalInput,
      output: totalOutput,
      cached: totalCached,
      cost: totalCost,
      durationMs: totalDuration,
      errors: totalErrors,
    },
    subagentChatTokens,
    orchestratorChats,
    allChats,
    get conversation() {
      conversationCache ??= buildConversation(spans)
      return conversationCache
    },
    callResolutions,
    toolGroups,
    frontendTools,
    systemPromptByAgent,
    aguiItems,
    descendantsOf,
    toolGroupsFor,
    descendantErrors,
  }
}

// Override labels for agentName collisions (same name, different agentIds).
function buildAgentLabels(spans: Span[]): Map<string, string> {
  const idsByName = new Map<string, Set<string>>()
  for (const s of spans) {
    if (!isAgentSpan(s) || !s.agentName || !s.agentId) continue
    let ids = idsByName.get(s.agentName)
    if (!ids) {
      ids = new Set()
      idsByName.set(s.agentName, ids)
    }
    ids.add(s.agentId)
  }
  const out = new Map<string, string>()
  for (const s of spans) {
    if (!isAgentSpan(s) || !s.agentName || !s.agentId) continue
    if ((idsByName.get(s.agentName)?.size ?? 0) <= 1) continue
    out.set(s.id, `${s.agentName} · ${s.agentId.slice(0, 8)}`)
  }
  return out
}
