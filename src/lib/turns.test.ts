import { describe, expect, it } from 'vitest'
import { findOrchestratorId, findOrchestratorIds, normalizeRunGraph, type Span, subagentChatSpans } from './spans'
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

// Apply normalizeRunGraph the way the providers do at fetch time, so tests
// exercise the same in-memory shape the helpers run against in prod.
function trace(items: Array<Partial<Span> & Pick<Span, 'id' | 'operation'>>): Span[] {
  const spans = items.map(span)
  normalizeRunGraph(spans)
  return spans
}

describe('findOrchestratorIds', () => {
  it('excludes nested invoke_agent runs (real subagent)', () => {
    const spans = trace([
      { id: 'root1', operation: 'http', traceId: 'tr1', endMs: 200 },
      { id: 'orch1', operation: 'invoke_agent', traceId: 'tr1', parentId: 'root1', startMs: 10 },
      // Direct nesting: sub1 has orch1 as parent → subagent, not orchestrator.
      { id: 'sub1', operation: 'invoke_agent', traceId: 'tr1', parentId: 'orch1', startMs: 20 },

      { id: 'root2', operation: 'http', traceId: 'tr2', startMs: 500, endMs: 700 },
      { id: 'orch2', operation: 'invoke_agent', traceId: 'tr2', parentId: 'root2', startMs: 510 },
    ])
    expect(findOrchestratorIds(spans)).toEqual(['orch1', 'orch2'])
    expect(findOrchestratorId(spans)).toBe('orch1')
  })

  // Topology #2: the .NET runtime re-invokes the agent per step within one
  // HTTP request, producing sibling top-level invoke_agents. ALL of them are
  // turn-equivalent — none is a subagent.
  it('returns every sibling top-level invoke_agent in a single trace', () => {
    const spans = trace([
      { id: 'root', operation: 'http', traceId: 'tr1', endMs: 500 },
      { id: 'orchA', operation: 'invoke_agent', traceId: 'tr1', parentId: 'root', startMs: 10 },
      { id: 'chatA', operation: 'chat', parentId: 'orchA', traceId: 'tr1', startMs: 20 },
      { id: 'orchB', operation: 'invoke_agent', traceId: 'tr1', parentId: 'root', startMs: 100 },
      { id: 'chatB', operation: 'chat', parentId: 'orchB', traceId: 'tr1', startMs: 110 },
    ])
    expect(findOrchestratorIds(spans)).toEqual(['orchA', 'orchB'])
  })

  // Topology #3 again, this time via the agent-as-tool wrapper:
  // invoke_agent → execute_tool → invoke_agent → chat. The wrapped invoke_agent
  // is a subagent even though its direct parent is a tool, not an agent.
  it('excludes invoke_agents wrapped by execute_tool under an orchestrator', () => {
    const spans = trace([
      { id: 'orch', operation: 'invoke_agent', traceId: 'tr1', startMs: 0, endMs: 500 },
      { id: 'tool', operation: 'tool', parentId: 'orch', traceId: 'tr1', startMs: 10 },
      { id: 'sub', operation: 'invoke_agent', parentId: 'tool', traceId: 'tr1', startMs: 15 },
      { id: 'subChat', operation: 'chat', parentId: 'sub', traceId: 'tr1', startMs: 20 },
    ])
    expect(findOrchestratorIds(spans)).toEqual(['orch'])
  })

  it('handles dangling-parent invoke_agents as top-level (post-normalize)', () => {
    // normalizeTraceRoots sets parentId=null when the parent isn't in the
    // returned span set. Such spans must still count as top-level.
    const spans = trace([{ id: 'orch', operation: 'invoke_agent', traceId: 'tr1', parentId: null, startMs: 10 }])
    expect(findOrchestratorIds(spans)).toEqual(['orch'])
  })

  it('returns an empty array when no invoke_agent spans exist', () => {
    // Topology #5: raw chats, no agent framework.
    const spans = trace([{ id: 'a', operation: 'chat' }])
    expect(findOrchestratorIds(spans)).toEqual([])
    expect(findOrchestratorId(spans)).toBeNull()
  })

  it('sorts results by start time across traces', () => {
    const spans = trace([
      { id: 'late', operation: 'invoke_agent', traceId: 'L', startMs: 1000 },
      { id: 'early', operation: 'invoke_agent', traceId: 'E', startMs: 100 },
    ])
    expect(findOrchestratorIds(spans)).toEqual(['early', 'late'])
  })

  it('trusts producer-emitted taskParentId over span-tree shape', () => {
    // Producer (Traceloop / agent-run-test / etc.) stamps gen_ai.task.parent.id
    // ahead of any tree walk. normalizeRunGraph must not overwrite it. Here
    // `sub` looks like a top-level invoke_agent by shape (parent is http) but
    // claims another agent's id as its parent — must still bucket as subagent.
    const spans = [
      span({ id: 'root', operation: 'http', traceId: 'tr1' }),
      span({ id: 'orch', operation: 'invoke_agent', parentId: 'root', traceId: 'tr1', startMs: 10 }),
      span({
        id: 'sub',
        operation: 'invoke_agent',
        parentId: 'root',
        traceId: 'tr1',
        startMs: 20,
        taskId: 'sub',
        taskParentId: 'orch',
      }),
    ]
    normalizeRunGraph(spans)
    expect(findOrchestratorIds(spans)).toEqual(['orch'])
  })
})

describe('subagentChatSpans', () => {
  // Rule: chat whose nearest invoke_agent ancestor is itself a subagent
  // (gen_ai.task.parent.id set after normalization).

  it('returns chats nested under an execute_tool that wraps an invoke_agent', () => {
    const spans = trace([
      { id: 'orch', operation: 'invoke_agent', traceId: 'tr1' },
      { id: 'orchChat', operation: 'chat', parentId: 'orch', traceId: 'tr1' },
      { id: 'tool', operation: 'tool', parentId: 'orch', traceId: 'tr1' },
      { id: 'sub', operation: 'invoke_agent', parentId: 'tool', traceId: 'tr1' },
      { id: 'subChat', operation: 'chat', parentId: 'sub', traceId: 'tr1', inputTokens: 100 },
    ])
    expect(subagentChatSpans(spans).map((s) => s.id)).toEqual(['subChat'])
  })

  it('returns no chats for sibling top-level invoke_agents (NOT subagents)', () => {
    // This is the false-positive that started the rewrite. Two sibling
    // top-level invoke_agents in one trace must produce zero subagent chats.
    const spans = trace([
      { id: 'root', operation: 'http', traceId: 'tr1' },
      { id: 'orchA', operation: 'invoke_agent', parentId: 'root', traceId: 'tr1' },
      { id: 'chatA', operation: 'chat', parentId: 'orchA', traceId: 'tr1' },
      { id: 'orchB', operation: 'invoke_agent', parentId: 'root', traceId: 'tr1' },
      { id: 'chatB', operation: 'chat', parentId: 'orchB', traceId: 'tr1' },
    ])
    expect(subagentChatSpans(spans)).toEqual([])
  })

  it('returns chats nested two agent-levels deep regardless of tool wrapping', () => {
    // sub → sub-sub (no tool between them) — leaf chat's nearest invoke_agent
    // ancestor is subSub, which has taskParentId=sub (a subagent). Counts.
    const spans = trace([
      { id: 'orch', operation: 'invoke_agent', traceId: 'tr1' },
      { id: 'sub', operation: 'invoke_agent', parentId: 'orch', traceId: 'tr1' },
      { id: 'subSub', operation: 'invoke_agent', parentId: 'sub', traceId: 'tr1' },
      { id: 'leafChat', operation: 'chat', parentId: 'subSub', traceId: 'tr1' },
    ])
    expect(subagentChatSpans(spans).map((s) => s.id)).toEqual(['leafChat'])
  })

  it('returns no chats when no invoke_agent exists', () => {
    // Topology #5.
    const spans = trace([{ id: 'c1', operation: 'chat' }])
    expect(subagentChatSpans(spans)).toEqual([])
  })

  it('returns no chats when only a single top-level invoke_agent exists', () => {
    // Topology #1 — the orchestrator's own chats are not subagent chats.
    const spans = trace([
      { id: 'orch', operation: 'invoke_agent', traceId: 'tr1' },
      { id: 'chat', operation: 'chat', parentId: 'orch', traceId: 'tr1' },
    ])
    expect(subagentChatSpans(spans)).toEqual([])
  })

  it('catches Pydantic-AI-style execute_tool → chat without an inner invoke_agent', () => {
    // Older Pydantic AI attributes the wrapped LLM call directly to the tool
    // span; no inner invoke_agent ever materializes. With the new attribute-
    // driven rule, the chat's nearest invoke_agent ancestor is the orchestrator
    // (no taskParentId), so this is NOT classified as a subagent chat. The
    // shape-walk era treated it as one — documenting the deliberate behaviour
    // change here so the cost-rollup path can decide what to do.
    const spans = trace([
      { id: 'orch', operation: 'invoke_agent', traceId: 'tr1' },
      { id: 'orchChat', operation: 'chat', parentId: 'orch', traceId: 'tr1' },
      { id: 'tool', operation: 'tool', parentId: 'orch', traceId: 'tr1' },
      { id: 'subChat', operation: 'chat', parentId: 'tool', traceId: 'tr1' },
    ])
    expect(subagentChatSpans(spans)).toEqual([])
  })

  it('handles deep nesting (10 levels) without recursion or stack issues', () => {
    // Build invoke_agent → invoke_agent → … (10 deep), with a chat at the leaf.
    const items: Array<Partial<Span> & Pick<Span, 'id' | 'operation'>> = []
    let parentId: string | null = null
    for (let i = 0; i < 10; i++) {
      const id = `agent${i}`
      items.push({ id, operation: 'invoke_agent', traceId: 'tr1', parentId })
      parentId = id
    }
    items.push({ id: 'leafChat', operation: 'chat', parentId, traceId: 'tr1' })
    const spans = trace(items)
    expect(subagentChatSpans(spans).map((s) => s.id)).toEqual(['leafChat'])
    expect(findOrchestratorIds(spans)).toEqual(['agent0'])
  })

  it('does not loop when a chat references a parent that is not in the span set', () => {
    // normalizeTraceRoots is supposed to set parentId=null in this case, but
    // we still want the helpers to terminate cleanly if it doesn't.
    const spans = trace([
      { id: 'orch', operation: 'invoke_agent', traceId: 'tr1' },
      { id: 'orphanChat', operation: 'chat', parentId: 'missing-id', traceId: 'tr1' },
    ])
    expect(subagentChatSpans(spans)).toEqual([])
  })
})

describe('extractTurns', () => {
  it('rolls multiple chats inside a single agent run into one turn', () => {
    // A tool-call cycle is one turn from the user's perspective: model emits
    // tool_calls in the first chat, the tool runs, the second chat carries the
    // result back. Both chats belong to the same run.
    const spans = trace([
      { id: 'orch', operation: 'invoke_agent', startMs: 0, endMs: 100 },
      { id: 'c1', operation: 'chat', parentId: 'orch', startMs: 1 },
      { id: 't1', operation: 'tool', parentId: 'orch', startMs: 2 },
      { id: 'c2', operation: 'chat', parentId: 'orch', startMs: 3 },
    ])
    const turns = extractTurns(spans, 'orch')
    expect(turns).toHaveLength(1)
    expect(turns[0].chats.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(turns[0].subagentChats).toEqual([])
    expect(turns[0].actions.map((a) => a.id)).toEqual(['t1'])
  })

  it('emits a turn even when the agent run had no chat spans', () => {
    const spans = trace([
      { id: 'orch', operation: 'invoke_agent' },
      { id: 't1', operation: 'tool', parentId: 'orch', startMs: 1 },
    ])
    const turns = extractTurns(spans, 'orch')
    expect(turns).toHaveLength(1)
    expect(turns[0].chats).toEqual([])
    expect(turns[0].actions.map((a) => a.id)).toEqual(['t1'])
  })

  it('produces one turn per top-level invoke_agent across a multi-trace session', () => {
    // Mirrors session cff5825a…: 4 ProverbsAgent runs sharing one session id.
    // Some runs have a tool-call cycle (2 chats); each still counts as 1 turn.
    const spans = trace([
      { id: 'orchA', operation: 'invoke_agent', traceId: 'A', startMs: 0, endMs: 50 },
      { id: 'a1', operation: 'chat', parentId: 'orchA', traceId: 'A', startMs: 10 },

      { id: 'orchB', operation: 'invoke_agent', traceId: 'B', startMs: 100, endMs: 150 },
      { id: 'b1', operation: 'chat', parentId: 'orchB', traceId: 'B', startMs: 110 },

      { id: 'orchC', operation: 'invoke_agent', traceId: 'C', startMs: 200, endMs: 280 },
      { id: 'c1', operation: 'chat', parentId: 'orchC', traceId: 'C', startMs: 210 },
      { id: 'c-tool', operation: 'tool', parentId: 'orchC', traceId: 'C', startMs: 215 },
      { id: 'c2', operation: 'chat', parentId: 'orchC', traceId: 'C', startMs: 220 },

      { id: 'orchD', operation: 'invoke_agent', traceId: 'D', startMs: 300, endMs: 400 },
      { id: 'd1', operation: 'chat', parentId: 'orchD', traceId: 'D', startMs: 310 },
      { id: 'd-tool', operation: 'tool', parentId: 'orchD', traceId: 'D', startMs: 315 },
      { id: 'd-sub', operation: 'invoke_agent', parentId: 'd-tool', traceId: 'D', startMs: 320 },
      // Sub-agent's chat is nested under the tool span — it must NOT bubble up
      // into orchD's chats list.
      { id: 'd-sub-chat', operation: 'chat', parentId: 'd-sub', traceId: 'D', startMs: 325 },
      { id: 'd2', operation: 'chat', parentId: 'orchD', traceId: 'D', startMs: 360 },
    ])
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
    // execute_tool span. extractTurns walks the orchestrator subtree by parent
    // pointer and bins any non-direct chat into subagentChats — independent of
    // the run-graph attrs. Pins behaviour for cost-rollup correctness.
    const spans = trace([
      { id: 'orch', operation: 'invoke_agent', startMs: 0, endMs: 200 },
      { id: 'tool', operation: 'tool', parentId: 'orch', startMs: 10 },
      {
        id: 'wrappedChat',
        operation: 'chat',
        parentId: 'tool',
        startMs: 20,
        inputTokens: 100,
        outputTokens: 20,
        costUsd: 0.02,
        model: 'gpt-4o',
      },
    ])
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
    const spans = trace([
      { id: 'orch', operation: 'invoke_agent', startMs: 0, endMs: 500 },
      { id: 'c1', operation: 'chat', parentId: 'orch', startMs: 10 },
      { id: 'tool', operation: 'tool', parentId: 'orch', startMs: 20 },
      { id: 'sub', operation: 'invoke_agent', parentId: 'tool', startMs: 25 },
      { id: 'subChat1', operation: 'chat', parentId: 'sub', startMs: 30 },
      { id: 'subChat2', operation: 'chat', parentId: 'sub', startMs: 50 },
      { id: 'c2', operation: 'chat', parentId: 'orch', startMs: 100 },
    ])
    const [turn] = extractTurns(spans, 'orch')
    expect(turn.chats.map((c) => c.id)).toEqual(['c1', 'c2'])
    expect(turn.subagentChats.map((c) => c.id)).toEqual(['subChat1', 'subChat2'])
  })

  it('orders turns by the run start time, not by trace insertion order', () => {
    const spans = trace([
      { id: 'orchLate', operation: 'invoke_agent', traceId: 'L', startMs: 1000 },
      { id: 'orchEarly', operation: 'invoke_agent', traceId: 'E', startMs: 100 },
    ])
    const turns = extractTurns(spans, ['orchLate', 'orchEarly'])
    expect(turns.map((t) => t.run.id)).toEqual(['orchEarly', 'orchLate'])
  })

  it('returns an empty list when given no orchestrator ids', () => {
    const spans = trace([{ id: 'c1', operation: 'chat' }])
    expect(extractTurns(spans, [])).toEqual([])
  })
})

describe('turnTotals', () => {
  it('folds sub-agent chat tokens and cost into the parent turn totals', () => {
    // Sub-agent costs belong to the turn that invoked the sub-agent —
    // matches how Langfuse / LangSmith / Phoenix roll up descendants onto
    // the root invocation. Without this, the per-turn rows underreport
    // and don't sum to the session total.
    const spans = trace([
      { id: 'orch', operation: 'invoke_agent', startMs: 0, endMs: 500 },
      {
        id: 'c1',
        operation: 'chat',
        parentId: 'orch',
        startMs: 10,
        inputTokens: 100,
        outputTokens: 20,
        costUsd: 0.01,
        model: 'gpt-4o',
      },
      { id: 'tool', operation: 'tool', parentId: 'orch', startMs: 50 },
      { id: 'sub', operation: 'invoke_agent', parentId: 'tool', startMs: 60 },
      {
        id: 'subChat',
        operation: 'chat',
        parentId: 'sub',
        startMs: 70,
        inputTokens: 200,
        outputTokens: 40,
        costUsd: 0.05,
        model: 'gpt-4o-mini',
      },
    ])
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
    const spans = trace([
      { id: 'orch', operation: 'invoke_agent', startMs: 0, endMs: 1000 },
      {
        id: 'c1',
        operation: 'chat',
        parentId: 'orch',
        startMs: 10,
        inputTokens: 100,
        outputTokens: 20,
        cachedTokens: 50,
        costUsd: 0.01,
        model: 'gpt-4o-mini',
      },
      {
        id: 'c2',
        operation: 'chat',
        parentId: 'orch',
        startMs: 500,
        inputTokens: 200,
        outputTokens: 30,
        cachedTokens: 150,
        costUsd: 0.02,
        model: 'gpt-4o-mini',
      },
    ])
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
    const spans = trace([
      { id: 'orch', operation: 'invoke_agent', endMs: 100 },
      { id: 'c1', operation: 'chat', parentId: 'orch', startMs: 1, model: 'gpt-3.5-turbo' },
      { id: 'c2', operation: 'chat', parentId: 'orch', startMs: 2, model: 'gpt-4o-mini' },
    ])
    const [turn] = extractTurns(spans, 'orch')
    expect(turnTotals(turn).model).toBe('gpt-4o-mini')
  })

  it('returns undefined model and zero tokens for chat-less runs', () => {
    const spans = trace([{ id: 'orch', operation: 'invoke_agent', endMs: 50 }])
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
