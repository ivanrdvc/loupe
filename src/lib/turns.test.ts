import { describe, expect, it } from 'vitest'
import { findOrchestratorId, findOrchestratorIds, type Span, subagentChatSpans } from './spans'
import { extractTurns, turnTotals } from './turns'

function span(overrides: Partial<Span> & Pick<Span, 'id' | 'operation'>): Span {
  return {
    traceId: 't1',
    parentId: null,
    service: 'svc',
    kind: 'internal',
    name: overrides.operation,
    startMs: 0,
    endMs: 100,
    ...overrides,
  }
}

describe('findOrchestratorIds', () => {
  // Topology #3 in docs/explanation/agent-trace-topology.md
  it('excludes nested invoke_agent runs (real subagent)', () => {
    const spans: Span[] = [
      span({ id: 'root1', operation: 'http', traceId: 'tr1', endMs: 200 }),
      span({ id: 'orch1', operation: 'invoke_agent', traceId: 'tr1', parentId: 'root1', startMs: 10 }),
      // Direct nesting: sub1 has orch1 as parent → subagent, not orchestrator.
      span({ id: 'sub1', operation: 'invoke_agent', traceId: 'tr1', parentId: 'orch1', startMs: 20 }),

      span({ id: 'root2', operation: 'http', traceId: 'tr2', startMs: 500, endMs: 700 }),
      span({ id: 'orch2', operation: 'invoke_agent', traceId: 'tr2', parentId: 'root2', startMs: 510 }),
    ]
    expect(findOrchestratorIds(spans)).toEqual(['orch1', 'orch2'])
    expect(findOrchestratorId(spans)).toBe('orch1')
  })

  // Topology #2: the .NET runtime re-invokes the agent per step within one
  // HTTP request, producing sibling top-level invoke_agents. ALL of them are
  // turn-equivalent — none is a subagent.
  it('returns every sibling top-level invoke_agent in a single trace', () => {
    const spans: Span[] = [
      span({ id: 'root', operation: 'http', traceId: 'tr1', endMs: 500 }),
      span({ id: 'orchA', operation: 'invoke_agent', traceId: 'tr1', parentId: 'root', startMs: 10 }),
      span({ id: 'chatA', operation: 'chat', parentId: 'orchA', traceId: 'tr1', startMs: 20 }),
      span({ id: 'orchB', operation: 'invoke_agent', traceId: 'tr1', parentId: 'root', startMs: 100 }),
      span({ id: 'chatB', operation: 'chat', parentId: 'orchB', traceId: 'tr1', startMs: 110 }),
    ]
    expect(findOrchestratorIds(spans)).toEqual(['orchA', 'orchB'])
  })

  // Topology #3 again, this time via the agent-as-tool wrapper:
  // invoke_agent → execute_tool → invoke_agent → chat. The wrapped invoke_agent
  // is a subagent even though its direct parent is a tool, not an agent.
  it('excludes invoke_agents wrapped by execute_tool under an orchestrator', () => {
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent', traceId: 'tr1', startMs: 0, endMs: 500 }),
      span({ id: 'tool', operation: 'tool', parentId: 'orch', traceId: 'tr1', startMs: 10 }),
      span({ id: 'sub', operation: 'invoke_agent', parentId: 'tool', traceId: 'tr1', startMs: 15 }),
      span({ id: 'subChat', operation: 'chat', parentId: 'sub', traceId: 'tr1', startMs: 20 }),
    ]
    expect(findOrchestratorIds(spans)).toEqual(['orch'])
  })

  it('handles dangling-parent invoke_agents as top-level (post-normalize)', () => {
    // normalizeTraceRoots sets parentId=null when the parent isn't in the
    // returned span set. Such spans must still count as top-level.
    const spans: Span[] = [span({ id: 'orch', operation: 'invoke_agent', traceId: 'tr1', parentId: null, startMs: 10 })]
    expect(findOrchestratorIds(spans)).toEqual(['orch'])
  })

  it('returns an empty array when no invoke_agent spans exist', () => {
    // Topology #5: raw chats, no agent framework.
    const spans: Span[] = [span({ id: 'a', operation: 'chat' })]
    expect(findOrchestratorIds(spans)).toEqual([])
    expect(findOrchestratorId(spans)).toBeNull()
  })

  it('sorts results by start time across traces', () => {
    const spans: Span[] = [
      span({ id: 'late', operation: 'invoke_agent', traceId: 'L', startMs: 1000 }),
      span({ id: 'early', operation: 'invoke_agent', traceId: 'E', startMs: 100 }),
    ]
    expect(findOrchestratorIds(spans)).toEqual(['early', 'late'])
  })
})

describe('subagentChatSpans', () => {
  // Rule: chat has ≥1 invoke_agent ancestor AND is not a direct child of a
  // top-level invoke_agent. See docs/explanation/agent-trace-topology.md.

  it('returns chats nested under an execute_tool that wraps an invoke_agent', () => {
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent', traceId: 'tr1' }),
      span({ id: 'orchChat', operation: 'chat', parentId: 'orch', traceId: 'tr1' }),
      span({ id: 'tool', operation: 'tool', parentId: 'orch', traceId: 'tr1' }),
      span({ id: 'sub', operation: 'invoke_agent', parentId: 'tool', traceId: 'tr1' }),
      span({ id: 'subChat', operation: 'chat', parentId: 'sub', traceId: 'tr1', inputTokens: 100 }),
    ]
    expect(subagentChatSpans(spans).map((s) => s.id)).toEqual(['subChat'])
  })

  it('returns no chats for sibling top-level invoke_agents (NOT subagents)', () => {
    // This is the false-positive that started the rewrite. Two sibling
    // top-level invoke_agents in one trace must produce zero subagent chats.
    const spans: Span[] = [
      span({ id: 'root', operation: 'http', traceId: 'tr1' }),
      span({ id: 'orchA', operation: 'invoke_agent', parentId: 'root', traceId: 'tr1' }),
      span({ id: 'chatA', operation: 'chat', parentId: 'orchA', traceId: 'tr1' }),
      span({ id: 'orchB', operation: 'invoke_agent', parentId: 'root', traceId: 'tr1' }),
      span({ id: 'chatB', operation: 'chat', parentId: 'orchB', traceId: 'tr1' }),
    ]
    expect(subagentChatSpans(spans)).toEqual([])
  })

  it('returns chats nested two agent-levels deep regardless of tool wrapping', () => {
    // sub → sub-sub (no tool between them) — still ≥2 ancestors for the leaf
    // chat. Some frameworks nest invoke_agent directly inside invoke_agent.
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent', traceId: 'tr1' }),
      span({ id: 'sub', operation: 'invoke_agent', parentId: 'orch', traceId: 'tr1' }),
      span({ id: 'subSub', operation: 'invoke_agent', parentId: 'sub', traceId: 'tr1' }),
      span({ id: 'leafChat', operation: 'chat', parentId: 'subSub', traceId: 'tr1' }),
    ]
    expect(subagentChatSpans(spans).map((s) => s.id)).toEqual(['leafChat'])
  })

  it('returns no chats when no invoke_agent exists', () => {
    // Topology #5.
    const spans: Span[] = [span({ id: 'c1', operation: 'chat' })]
    expect(subagentChatSpans(spans)).toEqual([])
  })

  it('returns no chats when only a single top-level invoke_agent exists', () => {
    // Topology #1 — the orchestrator's own chats are not subagent chats.
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent', traceId: 'tr1' }),
      span({ id: 'chat', operation: 'chat', parentId: 'orch', traceId: 'tr1' }),
    ]
    expect(subagentChatSpans(spans)).toEqual([])
  })

  it('catches Pydantic-AI-style execute_tool → chat without an inner invoke_agent', () => {
    // Topology 3b — older Pydantic AI versions attribute the wrapped LLM call
    // directly to the tool span; no inner invoke_agent ever materializes.
    // The chat has only 1 invoke_agent ancestor (the orchestrator), so a
    // strict ≥2-ancestor rule would have missed it.
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent', traceId: 'tr1' }),
      span({ id: 'orchChat', operation: 'chat', parentId: 'orch', traceId: 'tr1' }),
      span({ id: 'tool', operation: 'tool', parentId: 'orch', traceId: 'tr1' }),
      span({ id: 'subChat', operation: 'chat', parentId: 'tool', traceId: 'tr1' }),
    ]
    expect(subagentChatSpans(spans).map((s) => s.id)).toEqual(['subChat'])
  })

  it('handles deep nesting (10 levels) without recursion or stack issues', () => {
    // Build invoke_agent → invoke_agent → … (10 deep), with a chat at the leaf.
    const spans: Span[] = []
    let parentId: string | null = null
    for (let i = 0; i < 10; i++) {
      const id = `agent${i}`
      spans.push(span({ id, operation: 'invoke_agent', traceId: 'tr1', parentId }))
      parentId = id
    }
    spans.push(span({ id: 'leafChat', operation: 'chat', parentId, traceId: 'tr1' }))
    expect(subagentChatSpans(spans).map((s) => s.id)).toEqual(['leafChat'])
    expect(findOrchestratorIds(spans)).toEqual(['agent0'])
  })

  it('does not loop when a chat references a parent that is not in the span set', () => {
    // normalizeTraceRoots is supposed to set parentId=null in this case, but
    // we still want the helpers to terminate cleanly if it doesn't.
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent', traceId: 'tr1' }),
      span({ id: 'orphanChat', operation: 'chat', parentId: 'missing-id', traceId: 'tr1' }),
    ]
    expect(subagentChatSpans(spans)).toEqual([])
  })
})

describe('extractTurns', () => {
  it('rolls multiple chats inside a single agent run into one turn', () => {
    // A tool-call cycle is one turn from the user's perspective: model emits
    // tool_calls in the first chat, the tool runs, the second chat carries the
    // result back. Both chats belong to the same run.
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent', startMs: 0, endMs: 100 }),
      span({ id: 'c1', operation: 'chat', parentId: 'orch', startMs: 1 }),
      span({ id: 't1', operation: 'tool', parentId: 'orch', startMs: 2 }),
      span({ id: 'c2', operation: 'chat', parentId: 'orch', startMs: 3 }),
    ]
    const turns = extractTurns(spans, 'orch')
    expect(turns).toHaveLength(1)
    expect(turns[0].chats.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(turns[0].subagentChats).toEqual([])
    expect(turns[0].actions.map((a) => a.id)).toEqual(['t1'])
  })

  it('emits a turn even when the agent run had no chat spans', () => {
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent' }),
      span({ id: 't1', operation: 'tool', parentId: 'orch', startMs: 1 }),
    ]
    const turns = extractTurns(spans, 'orch')
    expect(turns).toHaveLength(1)
    expect(turns[0].chats).toEqual([])
    expect(turns[0].actions.map((a) => a.id)).toEqual(['t1'])
  })

  it('produces one turn per top-level invoke_agent across a multi-trace session', () => {
    // Mirrors session cff5825a…: 4 ProverbsAgent runs sharing one session id.
    // Some runs have a tool-call cycle (2 chats); each still counts as 1 turn.
    const spans: Span[] = [
      span({ id: 'orchA', operation: 'invoke_agent', traceId: 'A', startMs: 0, endMs: 50 }),
      span({ id: 'a1', operation: 'chat', parentId: 'orchA', traceId: 'A', startMs: 10 }),

      span({ id: 'orchB', operation: 'invoke_agent', traceId: 'B', startMs: 100, endMs: 150 }),
      span({ id: 'b1', operation: 'chat', parentId: 'orchB', traceId: 'B', startMs: 110 }),

      span({ id: 'orchC', operation: 'invoke_agent', traceId: 'C', startMs: 200, endMs: 280 }),
      span({ id: 'c1', operation: 'chat', parentId: 'orchC', traceId: 'C', startMs: 210 }),
      span({ id: 'c-tool', operation: 'tool', parentId: 'orchC', traceId: 'C', startMs: 215 }),
      span({ id: 'c2', operation: 'chat', parentId: 'orchC', traceId: 'C', startMs: 220 }),

      span({ id: 'orchD', operation: 'invoke_agent', traceId: 'D', startMs: 300, endMs: 400 }),
      span({ id: 'd1', operation: 'chat', parentId: 'orchD', traceId: 'D', startMs: 310 }),
      span({ id: 'd-tool', operation: 'tool', parentId: 'orchD', traceId: 'D', startMs: 315 }),
      span({ id: 'd-sub', operation: 'invoke_agent', parentId: 'd-tool', traceId: 'D', startMs: 320 }),
      // Sub-agent's chat is nested under the tool span — it must NOT bubble up
      // into orchD's chats list.
      span({ id: 'd-sub-chat', operation: 'chat', parentId: 'd-sub', traceId: 'D', startMs: 325 }),
      span({ id: 'd2', operation: 'chat', parentId: 'orchD', traceId: 'D', startMs: 360 }),
    ]
    const orchIds = findOrchestratorIds(spans)
    const turns = extractTurns(spans, orchIds)
    expect(turns).toHaveLength(4)
    expect(turns.map((t) => t.run.id)).toEqual(['orchA', 'orchB', 'orchC', 'orchD'])
    expect(turns[2].chats.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(turns[3].chats.map((c) => c.id)).toEqual(['d1', 'd2'])
    // d-sub-chat lives under the sub-agent, not directly under orchD —
    // it must stay out of `chats` and instead land in `subagentChats`.
    expect(turns[3].chats.map((c) => c.id)).not.toContain('d-sub-chat')
    expect(turns[3].subagentChats.map((c) => c.id)).toEqual(['d-sub-chat'])
  })

  it('routes wrapped LLM calls (execute_tool → chat, no inner invoke_agent) into subagentChats', () => {
    // Some instrumentations attribute an LLM call directly to the wrapping
    // execute_tool span (see spans.ts shape #2). The chat is still part of
    // the orchestrator's work, but with no inner invoke_agent it's not a
    // true sub-agent. Current rule: depth ≥1 → subagentChats. This pins it
    // down so cost still rolls up via turnTotals, and surfaces the choice
    // if/when we want to reclassify these as orchestrator-level chats.
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent', startMs: 0, endMs: 200 }),
      span({ id: 'tool', operation: 'tool', parentId: 'orch', startMs: 10 }),
      span({
        id: 'wrappedChat',
        operation: 'chat',
        parentId: 'tool',
        startMs: 20,
        inputTokens: 100,
        outputTokens: 20,
        costUsd: 0.02,
        model: 'gpt-4o',
      }),
    ]
    const [turn] = extractTurns(spans, 'orch')
    expect(turn.chats).toEqual([])
    expect(turn.subagentChats.map((c) => c.id)).toEqual(['wrappedChat'])
    const t = turnTotals(turn)
    expect(t.inputTokens).toBe(100)
    expect(t.outputTokens).toBe(20)
    expect(t.costUsd).toBeCloseTo(0.02)
    // No orchestrator-direct chat → no model on the rollup. Documents the
    // current behavior; revisit if/when the UI needs a model badge for
    // these traces.
    expect(t.model).toBeUndefined()
  })

  it('collects chats nested under sub-agents into subagentChats', () => {
    // execute_tool wraps an invoke_agent which fires its own chats — those
    // chats belong to this turn's cost, but not to the orchestrator's
    // visible chat sequence.
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent', startMs: 0, endMs: 500 }),
      span({ id: 'c1', operation: 'chat', parentId: 'orch', startMs: 10 }),
      span({ id: 'tool', operation: 'tool', parentId: 'orch', startMs: 20 }),
      span({ id: 'sub', operation: 'invoke_agent', parentId: 'tool', startMs: 25 }),
      span({ id: 'subChat1', operation: 'chat', parentId: 'sub', startMs: 30 }),
      span({ id: 'subChat2', operation: 'chat', parentId: 'sub', startMs: 50 }),
      span({ id: 'c2', operation: 'chat', parentId: 'orch', startMs: 100 }),
    ]
    const [turn] = extractTurns(spans, 'orch')
    expect(turn.chats.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(turn.subagentChats.map((c) => c.id)).toEqual(['subChat1', 'subChat2'])
  })

  it('orders turns by the run start time, not by trace insertion order', () => {
    const spans: Span[] = [
      span({ id: 'orchLate', operation: 'invoke_agent', traceId: 'L', startMs: 1000 }),
      span({ id: 'orchEarly', operation: 'invoke_agent', traceId: 'E', startMs: 100 }),
    ]
    const turns = extractTurns(spans, ['orchLate', 'orchEarly'])
    expect(turns.map((t) => t.run.id)).toEqual(['orchEarly', 'orchLate'])
  })

  it('returns an empty list when given no orchestrator ids', () => {
    const spans: Span[] = [span({ id: 'c1', operation: 'chat' })]
    expect(extractTurns(spans, [])).toEqual([])
  })
})

describe('turnTotals', () => {
  it('folds sub-agent chat tokens and cost into the parent turn totals', () => {
    // Sub-agent costs belong to the turn that invoked the sub-agent —
    // matches how Langfuse / LangSmith / Phoenix roll up descendants onto
    // the root invocation. Without this, the per-turn rows underreport
    // and don't sum to the session total.
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent', startMs: 0, endMs: 500 }),
      span({
        id: 'c1',
        operation: 'chat',
        parentId: 'orch',
        startMs: 10,
        inputTokens: 100,
        outputTokens: 20,
        costUsd: 0.01,
        model: 'gpt-4o',
      }),
      span({ id: 'tool', operation: 'tool', parentId: 'orch', startMs: 50 }),
      span({ id: 'sub', operation: 'invoke_agent', parentId: 'tool', startMs: 60 }),
      span({
        id: 'subChat',
        operation: 'chat',
        parentId: 'sub',
        startMs: 70,
        inputTokens: 200,
        outputTokens: 40,
        costUsd: 0.05,
        model: 'gpt-4o-mini',
      }),
    ]
    const [turn] = extractTurns(spans, 'orch')
    const t = turnTotals(turn)
    expect(t.inputTokens).toBe(300)
    expect(t.outputTokens).toBe(60)
    expect(t.costUsd).toBeCloseTo(0.06)
    // Model still reflects the orchestrator's last chat (the visible answer),
    // not the sub-agent's.
    expect(t.model).toBe('gpt-4o')
  })

  it('sums tokens and cost across all chats in the run', () => {
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent', startMs: 0, endMs: 1000 }),
      span({
        id: 'c1',
        operation: 'chat',
        parentId: 'orch',
        startMs: 10,
        inputTokens: 100,
        outputTokens: 20,
        cachedTokens: 50,
        costUsd: 0.01,
        model: 'gpt-4o-mini',
      }),
      span({
        id: 'c2',
        operation: 'chat',
        parentId: 'orch',
        startMs: 500,
        inputTokens: 200,
        outputTokens: 30,
        cachedTokens: 150,
        costUsd: 0.02,
        model: 'gpt-4o-mini',
      }),
    ]
    const [turn] = extractTurns(spans, 'orch')
    expect(turnTotals(turn)).toEqual({
      inputTokens: 300,
      outputTokens: 50,
      cachedTokens: 200,
      costUsd: 0.03,
      durationMs: 1000,
      model: 'gpt-4o-mini',
    })
  })

  it('reports the final chat’s model when the run swapped models mid-flight', () => {
    const spans: Span[] = [
      span({ id: 'orch', operation: 'invoke_agent', endMs: 100 }),
      span({ id: 'c1', operation: 'chat', parentId: 'orch', startMs: 1, model: 'gpt-3.5-turbo' }),
      span({ id: 'c2', operation: 'chat', parentId: 'orch', startMs: 2, model: 'gpt-4o-mini' }),
    ]
    const [turn] = extractTurns(spans, 'orch')
    expect(turnTotals(turn).model).toBe('gpt-4o-mini')
  })

  it('returns undefined model and zero tokens for chat-less runs', () => {
    const spans: Span[] = [span({ id: 'orch', operation: 'invoke_agent', endMs: 50 })]
    const [turn] = extractTurns(spans, 'orch')
    expect(turnTotals(turn)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
      durationMs: 50,
      model: undefined,
    })
  })
})
