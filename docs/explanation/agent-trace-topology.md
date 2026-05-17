---
title: Agent trace topology
type: explanation
summary: Why we infer agent topology from span trees, the shapes runtimes
         actually emit, the one primitive that handles all of them, and
         which rules are guesses we'd rather replace with real signals.
status: stable
owner: "@ivan"
audience: agentops-devs
last-reviewed: 2026-05-17
tags: [ingest, span-classification, agents]
---

# Agent trace topology

This doc exists because the same question — "is this chat span part of the orchestrator turn or a subagent run?" — keeps coming back in different shapes as we wire up new runtimes. The answers live in the code, but the *why* keeps slipping. This is the why.

## Why we infer

The OpenTelemetry `gen_ai.*` semantic conventions standardize **per-call attributes** (model, tokens, cost, tool definitions) but say nothing about **multi-agent topology**. There's no:

- `gen_ai.agent.parent_id` — "this run is nested under that one"
- `gen_ai.run.kind = orchestrator | subagent` — explicit role
- `gen_ai.turn.id` — a turn-boundary marker
- Canonical sub-agent invocation span

So every runtime invents its own tree shape, and we infer the rest from the **parent-child structure** plus the span names. There is no standards-compliant runtime today that hands us topology on a plate.

## How others avoid this problem

Two strategies, both incompatible with our positioning:

**Own the SDK.** Langfuse and LangSmith offer first-party SDKs where the user explicitly creates `Trace`, `Session`, `Generation`, `Span` objects. The model is unambiguous because it's authored by hand. The cost: arbitrary OTel-only data (i.e. anyone using a non-Langfuse runtime) doesn't ingest well.

**Standardize span kinds.** Phoenix (Arize) leans on the [`openinference`](https://github.com/Arize-ai/openinference) extension — every span carries `openinference.span.kind = "LLM" | "AGENT" | "CHAIN" | "TOOL" | …`, so spans self-describe and the UI mostly colors and lays out the tree. They get this by being instrumentation-opinionated — they ship the instrumentation libraries that emit the attribute.

We chose **provider-agnostic OTel ingest**: CrewAI, OpenAI Agents SDK, Microsoft Agent Framework, Pydantic AI, LangGraph — whatever a user instruments their agent with, we want it to render usefully. The inference cost is the price of that stance. This doc minimizes the cost by making the inference rules explicit, named, and shared.

## Topologies we've observed

Five shapes account for everything we've seen. Each is normal — none is "wrong" — and our rules have to handle all of them.

### 1. Single root orchestrator

```
invoke_agent Orchestrator
├─ chat                        ← turn 1, LLM call
├─ execute_tool get_weather    ← real backend tool
└─ chat                        ← turn 2 (final answer)
```

The simplest case. One `invoke_agent` per HTTP turn. OpenAI Agents SDK + Pydantic AI tend to look like this.

### 2. Sibling top-level invoke_agents in one trace

```
POST /
├─ invoke_agent Orchestrator   ← step 1 of one user turn
│  └─ chat
└─ invoke_agent Orchestrator   ← step 2 of the SAME user turn
   └─ chat
```

The Microsoft Agent Framework (.NET) re-invokes the agent for each internal step within one HTTP request. Both invoke_agents are top-level — neither is nested inside the other. They are **not** orchestrator-vs-subagent; they're two independent runs of the same agent.

This is what bit us: the old `findOrchestratorIds` picked the shallowest invoke_agent per trace and treated the rest as subagents. With this topology, *every* sibling top-level run after the first was misclassified.

### 3. Agent-as-tool (true subagent)

```
invoke_agent Orchestrator
├─ chat
├─ execute_tool sub_agent_name      ← looks like a tool…
│  └─ invoke_agent SubAgent         ← …but wraps a real agent run
│     └─ chat                       ← THIS chat is the subagent chat
└─ chat                             ← orchestrator's final answer
```

The canonical multi-agent pattern, documented under "Agent-as-tool pattern" in `docs/reference/ai-attributes.md`. The OpenAI Agents SDK uses this shape when one agent hands off to another via a tool. To detect "is this tool actually a sub-agent?", check whether the `execute_tool` span has an `invoke_agent` child — that's what `findWrappedAgent()` does.

### 3b. Agent-as-tool, wrapped invoke_agent omitted

```
invoke_agent Orchestrator
├─ chat
├─ execute_tool sub_agent_name      ← tool wraps the sub-agent's LLM call…
│  └─ chat                          ← …but no inner invoke_agent span exists
└─ chat
```

A variant of #3 emitted by older Pydantic AI versions and a few hand-rolled instrumentations: the LLM call the sub-agent makes is attributed directly to the tool span, with no inner `invoke_agent`. The chat here has only one `invoke_agent` ancestor (the orchestrator), so a strict ≥2-ancestor rule would miss it. The subagent rule below handles this by also accepting "chat that's not a direct child of any top-level invoke_agent."

### 4. Multi-trace sessions

```
trace A: POST → invoke_agent → chat        ← user message 1
trace B: POST → invoke_agent → chat        ← user message 2
trace C: POST → invoke_agent → chat        ← user message 3
```

Common when each user message is a fresh HTTP request. The session is the union of traces, correlated by `session.id` / `gen_ai.conversation.id` / `ag_ui.thread_id` (or the agent-instance hex heuristic, see below). Each trace is one turn.

### 5. Chats without an invoke_agent wrapper

```
POST /v1/chat/completions
└─ chat
```

Raw LLM calls — no agent framework involved. Some sessions are entirely this. There's no orchestrator to find; the chats are the whole story.

## The unifying primitive

One count grounds every rule:

> **`countAgentAncestors(span)`** — how many `invoke_agent` spans sit between this span and the root.

The rules in `src/lib/spans.ts`:

| Question | Rule |
|---|---|
| Is this invoke_agent top-level (an orchestrator turn)? | chain has zero `invoke_agent` ancestors |
| Is this invoke_agent a subagent? | chain has ≥1 `invoke_agent` ancestor |
| Is this chat a subagent chat (for "Subagents" token rollup)? | chat has ≥1 `invoke_agent` ancestor AND is not a direct child of a top-level `invoke_agent` |
| Is this execute_tool actually wrapping an agent? | it has an `invoke_agent` direct child (`findWrappedAgent`) |

The subagent rule deliberately phrases the chat case in two parts — the ancestor-count check covers topologies 3 and deeper nesting; the "not a direct child of top-level" check covers topology 3b where the wrapped invoke_agent is absent. Topologies 1 and 2 have all chats as direct children of top-level runs, so nothing is a subagent. Topology 5 (no agent at all) is excluded by the ancestor-count guard — raw chats are never "subagent."

Helpers built on the primitive:

- `findOrchestratorIds(spans)` — every `invoke_agent` with zero agent ancestors, sorted by start time
- `subagentChatSpans(spans)` — chats matching the subagent rule above
- `findWrappedAgent(spans, toolId)` — the orthogonal "agent-as-tool" structural test

If a new topology appears in the wild, add a tested example to `src/lib/turns.test.ts` first; if the rules above don't already cover it, the doc and the rules update together.

## Heuristics — what they are, where they live

A **heuristic** here means: "no formal signal in OTel exists, so we apply a pattern we observed to work in real runtimes. It's right most of the time; sometimes it's wrong; the UI labels the result so users know it's a guess."

| Heuristic | Where | What it does | Failure mode |
|---|---|---|---|
| **Agent-instance hex as session id** | `classify-span.ts` — `classifySpan` session correlation block | When no `session.id` / `ag_ui.thread_id` / `gen_ai.conversation.id` is present, extract the hex inside `invoke_agent <Name>(<hex>)` and use it as a session key. UI shows a yellow `heuristic id` pill. | Frameworks that emit a different name format produce no session id, so the session doesn't appear in the sessions list. Reachable directly by run id. |
| **Frontend tool detection** | `context.tsx` — `collectFrontendTools` | A tool is "frontend" if the LLM emitted a `tool_call` for it AND no `execute_tool` span ran it. **Gated** on at least one `execute_tool` span existing in the session — if backend instrumentation is dark, the function returns nothing rather than mislabel every backend tool. | Still misses frontend tools defined but never called this session. Also still misses backend tools called for the first time mid-session before any `execute_tool` lands — the in-flight call looks frontend until the matching span arrives. |
| **Real tool vs. wrapped agent** | `spans.ts` — `findWrappedAgent` | An `execute_tool` span is treated as a sub-agent invocation iff it has an `invoke_agent` direct child. | Misses topology 3b where the wrapped invoke_agent is absent — the subagent chat rule catches it separately via the "not a direct child of top-level" branch. |
| **Subagent chat rollup** | `spans.ts` — `subagentChatSpans` | A chat is "subagent" iff it has ≥1 `invoke_agent` ancestor AND is not a direct child of any top-level `invoke_agent`. | Counts chats nested under any `execute_tool` (regardless of whether it wraps a real sub-agent) as subagent. Acceptable — those tokens are work happening below the orchestrator either way, and surfacing them is the point of the rollup. |

## Future: what we'd want runtimes to emit

The day OTel GenAI ships a topology attribute, most of these heuristics retire. Candidates we'd adopt immediately:

- **`openinference.span.kind`** — the Phoenix/Arize convention; the cheapest win. We could opportunistically read it today and treat it as authoritative when present, keeping the inference rules as fallback.
- **`gen_ai.agent.parent_id`** — explicit "this invoke_agent is nested under that one." Would let us replace `countAgentAncestors` with an O(1) lookup.
- **`gen_ai.conversation.id`** is already read (see `classify-span.ts`), but emitted inconsistently — when adoption widens enough that we never have to fall back, the agent-instance hex heuristic retires.

Until then, the ancestor-counting primitive is the cheapest correct stance: one rule, structural, testable, framework-agnostic.
