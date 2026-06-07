---
title: Architecture
type: explanation
summary: How loupe reads OTel traces, normalizes them through one classifier,
  layers session / purpose / category / errors / sub-agent inference on top,
  and where every piece lives in the code.
status: current
owner: Ivan
audience: loupe-devs, AI assistants
last-reviewed: 2026-05-25
tags: [architecture, ingest, classification, entry-point]
---

# Architecture

loupe reads OTel traces emitted by agent frameworks, classifies the spans,
and renders agent activity. Read-only — no local telemetry mirror.

For the canonical list of attributes producers emit and loupe reads, see [`02-spec.md`](02-spec.md).

## Mental model

```
  Session  (grouped by gen_ai.conversation.id / ag_ui.thread_id / session.id /
            langfuse.session.id / openinference.session.id)
   └── Trace  (one HTTP request → one trace; OTel trace_id)
        └── Spans  (nested tree)
             invoke_agent <AgentName>(<hex>)
              ├── chat <model>                ← LLM call
              ├── execute_tool <name>         ← MEAI / OpenAI Agents SDK
              │    └── tools/call <name>      ← MCP client (when tool is MCP)
              ├── execute_tool <sub_agent>
              │    └── invoke_agent <Sub>     ← agent-as-tool (true sub-agent)
              │         └── chat
              ├── title_generation            ← utility (purpose-tagged)
              │    └── chat
              ├── memory.access               ← producer-specific Activity
              └── orchestrate_tools           ← producer-specific Activity
```

Session is the only level loupe *adds*. Trace and Span are OTel.
Span names shown above are the ones we recognize and route through the
classifier; full vocabulary in [`../reference/ai-attributes.md`](../reference/ai-attributes.md).

## Boundary

We do not instrument; we read.

```
  Agent frameworks                       Backends we read
  (Microsoft Agent Framework,            OpenObserve   (DataFusion / SQL)
   OpenAI Agents SDK,                    App Insights  (KQL)
   Pydantic AI, CrewAI,
   LangGraph, raw OpenAI/Anthropic …)
        │ OTel exporter                          │
        ▼                                        ▼
        ─────────────────────────────────────────►  loupe
                producer's choice                       (this repo)
```

Provider-agnostic: any backend returning span rows with OTel-shaped attributes
works. Each provider is one file under `lib/telemetry/` implementing the
`TelemetryProvider` interface (`lib/telemetry/types.ts`).

## Data flow

```
  provider.{listTraces, listSessions, getSession, getTrace}
        │ each row → { name, attrs }
        ▼
  classifySpan(name, attrs)                    ← lib/spans/classify-span.ts
        │ • OpenInference span.kind override (explicit producer signal wins)
        │ • else: gen_ai.operation.name → span-name prefix → 'http'
        │ Classification (typed, normalized)
        ▼
  Span[] post-processing                       ← lib/spans/index.ts
   • dedupeById
   • normalizeTraceRoots             (orphan parents → root)
   • propagateSessionInTrace         (lift session id to nested spans;
                                      trace_id fallback if no attribute)
   • propagateInheritedAttrs         (operationName, agUiRunId from ancestors)
   • parent ↔ child linkage
   • normalizeRunGraph               (stamps taskId / taskParentId)
        │
        ▼
  route -data.ts (server fn + queryOptions)    ← src/routes/<feature>/-data.ts
        │
        ▼
  React Query → components
   • lib/spans/conversation.ts:           Span[] → ConversationEvent[]  (chat bubbles, tool cards)
   • features/inspect/logic/turns.ts:     per-turn token / cost / duration rollup
   • lib/spans/index.ts: taskParentId distinguishes sub-agent (set) vs orchestrator (unset)
```

One classifier. Providers normalize *key shape* (dotted vs underscore, row
column names); they never decide *field meaning*. That decision lives in
`classify-span.ts`, full stop.

## Span shape  (`src/lib/spans/index.ts`)

```
  Span.operation       http | chat | tool | mcp | invoke_agent
                       'mcp' = raw MCP protocol span (tools/call …),
                       'tool' = agent-framework wrapper (execute_tool …).
                       The UI unifies them — same row shape, different source.
  Span.model           gen_ai.{request,response}.model
  Span.{input,output,total}Tokens, costUsd
  Span.agentName       gen_ai.agent.name | parsed from "invoke_agent X(…)"
  Span.toolName        gen_ai.tool.name  | parsed from "execute_tool X"
  Span.llmInput / llmOutput      messages in / out (OTel | Logfire | OpenLLMetry)
  Span.toolCallId, toolResult    paired across chat.tool_call ↔ execute_tool

  Span.sessionId       lifted from a session attribute (see below)
  Span.sessionSource   'attribute' | 'trace'   ← discloses whether it's real
  Span.operationName   utility-purpose tag (title_generation, summarize, …)
  Span.outputType      gen_ai.output.type — non-text marks a structured call

  Span.rawAttributes   full bag, for the raw-fields inspector
```

## What loupe layers on top of OTel

These are loupe-specific concepts. OTel GenAI semconv defines none of them. The canonical convention list is in [`02-spec.md`](02-spec.md); the rules below are the consumer-side derivation when producers don't stamp the attrs themselves.

**Session** — roll-up of traces sharing a conversation id.

```
  Lifted from:  gen_ai.conversation.id
                session.id
                ag_ui.thread_id
                langfuse.session.id
                openinference.session.id
  Fallback:     trace_id  (sessionSource = 'trace')
```

Trace-id fallback keeps the detail page resolvable for spans without a real
session attribute; those don't appear in the sessions list (they're individual
runs).

**Purpose** — tag for utility LLM calls.

```
  Read from:    gen_ai.operation.purpose
  Examples:     title_generation, summarize, embed_for_search
  Propagation:  the attribute sits on an ancestor Activity, NOT on the
                nested chat span — propagateSessionInTrace lifts it down.
```

**Category** — why this trace ran. One per trace.
Implemented in `lib/telemetry/trace-category.ts` — `classifyTraceCategory()`. Priority order, first match wins (exactly as encoded in the function — pinned by `trace-category.test.ts`):

```
  scheduled    session.trigger_type = scheduled
  event        session.trigger_type = event
  webhook      session.trigger_type = webhook
  background   session.trigger_type = user AND session.execution = background
  sub-agent    root span operation is 'tool' or 'mcp' AND trace has invoke_agent descendants
  chat         trace has an invoke_agent span
  utility      root span carries gen_ai.operation.purpose
  chat         trace has a session attribute
  utility      trace has chat spans (fallback for raw LLM calls with no other context)
  orphan       nothing matched
```

Producer intent wins — a scheduled trigger on a structurally sub-agent-shaped trace still reports `scheduled`. The `chat → utility → chat → utility` interleave is intentional: `hasInvokeAgent` and `hasSessionAttribute` are independent proxies for "is this conversational?", and producers emit either or both inconsistently.

Where a utility shows up follows the producer's emission shape:
- **Emitted as its own trace** (own `trace_id`, root span carries the purpose
  attr) → listed on `/traces` with category `utility`.
- **Emitted as a nested span inside a larger trace** → invisible from the
  trace list, surfaced on the Spans tab (`?tab=spans`).

The Spans tab is a flat-spans view fed by `provider.listSpans`, which
returns nested purpose-attr spans plus nested sub-agent invocations
(`invoke_agent` whose parent is `execute_tool`). Each row links to its
parent trace.

**Errors** — what failed and where, surfaced per span.

```
  Read from:    [App Insights] customDimensions['error.type'], resultCode (4xx/5xx),
                              exceptions table joined by operation_ParentId
                              (type, outerMessage, details[0].rawStack)
                [OpenObserve] exception.type/message/stacktrace, error.type,
                              http.response.status_code (dot AND underscore variants)
  Populated on: Span.errorType, Span.errorMessage, Span.errorStack
  Fallback:     "HTTP 4xx" synthesized from resultCode when no type/message exists
  Routing rule: if error.type is a 3-digit HTTP status, store it as errorMessage
                ("HTTP 401") rather than errorType, so the UI doesn't render "401: HTTP 401"
```

Rendered in the DetailPanel as a callout (type + message + stack) at the top of
a selected span. Descendants of the selected span that also carry error info
appear as "caused by" tiles under the primary error; clicking jumps to that
span (BFS, capped at 5 entries with a visited-set cycle guard).

Known gap: agent loops that recover from sub-span failures leave the root
`span_status = OK`, so the run reads as successful at session level even when
inner spans errored. The error is still visible on the inner span when
selected in the tree.

## Trace topologies the inference handles

Five shapes account for everything we've seen. Each is normal — none is "wrong" — and our fallback inference (next section) has to handle all of them when producers don't stamp `gen_ai.task.parent.id` natively.

### 1. Single root orchestrator

```
invoke_agent Orchestrator
├─ chat                        ← turn 1, LLM call
├─ execute_tool get_weather    ← real backend tool
└─ chat                        ← turn 2 (final answer)
```

One `invoke_agent` per HTTP turn. OpenAI Agents SDK + Pydantic AI tend to look like this.

### 2. Sibling top-level invoke_agents in one trace

```
POST /
├─ invoke_agent Orchestrator   ← step 1 of one user turn
│  └─ chat
└─ invoke_agent Orchestrator   ← step 2 of the SAME user turn
   └─ chat
```

The Microsoft Agent Framework (.NET) re-invokes the agent for each internal step within one HTTP request. Both invoke_agents are top-level — not nested. They are not orchestrator-vs-subagent; they're two independent runs of the same agent.

### 3. Agent-as-tool (true subagent)

```
invoke_agent Orchestrator
├─ chat
├─ execute_tool sub_agent_name      ← looks like a tool…
│  └─ invoke_agent SubAgent         ← …but wraps a real agent run
│     └─ chat                       ← THIS chat is the subagent chat
└─ chat                             ← orchestrator's final answer
```

The canonical multi-agent pattern. OpenAI Agents SDK uses this shape when one agent hands off to another via a tool. The nested `invoke_agent` is what makes this a real sub-agent: `normalizeRunGraph` stamps its `taskParentId` to the orchestrator's task, so sub-agent detection reduces to `taskParentId != null`.

### 3b. Agent-as-tool, wrapped invoke_agent omitted

```
invoke_agent Orchestrator
├─ chat
├─ execute_tool sub_agent_name      ← tool wraps the sub-agent's LLM call…
│  └─ chat                          ← …but no inner invoke_agent span exists
└─ chat
```

Variant emitted by older Pydantic AI versions and a few hand-rolled instrumentations. The chat here has only one `invoke_agent` ancestor (the orchestrator), so a strict ≥2-ancestor rule would miss it.

### 4. Multi-trace sessions

```
trace A: POST → invoke_agent → chat        ← user message 1
trace B: POST → invoke_agent → chat        ← user message 2
trace C: POST → invoke_agent → chat        ← user message 3
```

Common when each user message is a fresh HTTP request. The session is the union of traces, correlated by `session.id` / `gen_ai.conversation.id` / `ag_ui.thread_id`. When no such attribute is on the spans, we don't try to stitch — those traces are individual runs and don't appear on the Sessions list at all.

### 5. Chats without an invoke_agent wrapper

```
POST /v1/chat/completions
└─ chat
```

Raw LLM calls — no agent framework involved. Some sessions are entirely this. There's no orchestrator to find; the chats are the whole story.

## Fallback inference rules

When producers don't stamp `gen_ai.task.parent.id` natively, loupe infers topology from span-tree shape. **Primary path is reading the stamped convention** ([`02-spec.md`](02-spec.md)); the fallback runs only when the attrs are absent.

`normalizeRunGraph` (in `src/lib/spans/index.ts`) collapses the inference to one stamp: every `invoke_agent` span gets `taskId` (its own span id) and `taskParentId` (the nearest ancestor `invoke_agent`'s `taskId`). Producer-emitted attrs pass through unchanged; the tree walk only fills the gaps.

Rules in `src/lib/spans/index.ts`:

| Question | Rule |
| -------- | ---- |
| Is this invoke_agent top-level (an orchestrator turn)? | `taskParentId == null` |
| Is this invoke_agent a subagent? | `taskParentId != null` |
| Is this chat a subagent chat (for "Subagents" token rollup)? | chat sits under an `invoke_agent` whose `taskParentId != null` |
| Is this execute_tool actually wrapping an agent? | it has an `invoke_agent` direct child (which then carries a `taskParentId`) |

If a new topology appears in the wild, add a tested example to `src/lib/spans/spans.test.ts` first; if the rules above don't cover it, this doc and `normalizeRunGraph` update together.

### Known failure modes

| Heuristic | What it does | Failure mode |
| --------- | ------------ | ------------ |
| Trace-id as session id (fallback) | When no `session.id` / `ag_ui.thread_id` / `gen_ai.conversation.id` is present, the `trace_id` becomes the session id so the detail page resolves. `aggregateSessions` drops these from the sessions list. | Producers without a session attribute don't appear in the sessions list — reachable only by direct URL until they start emitting one. |
| Frontend tool detection (`collectFrontendTools`, `src/features/inspect/logic/tools.ts`) | A tool is "frontend" if the LLM emitted a `tool_call` for it AND no `execute_tool` span ran it. Gated on at least one `execute_tool` span existing in the session — if backend instrumentation is dark, returns nothing rather than mislabel every backend tool. | Misses frontend tools defined but never called this session. Misses backend tools called for the first time mid-session before any `execute_tool` lands. |
| Real tool vs. wrapped agent | An `execute_tool` is a sub-agent invocation iff it has an `invoke_agent` direct child (that child then carries a `taskParentId`). | Misses topology 3b where the wrapped invoke_agent is absent. |
| Subagent chat rollup | A chat is "subagent" iff it sits under an `invoke_agent` whose `taskParentId != null`. | Counts chats nested under any `execute_tool` (regardless of whether it wraps a real sub-agent) as subagent. Acceptable — surfaces the work happening below the orchestrator either way. |

## Code map

```
  src/lib/                          framework-free, pure, testable
    spans/
      index.ts              Span type, tree helpers, normalizeRunGraph (taskId/taskParentId)
      classify-span.ts      attrs + name → Classification (single source of rules)
      conversation.ts       Span[] → ConversationEvent[] (UI render input)
      tokens.ts             tokenizer family + breakdown math
      llm-pricing.ts        model → $/token, fills costUsd when producer omits
    telemetry/
      types.ts              TelemetryProvider interface (listTraces, listSpans,
                            listSessions, getTrace, getSession, query)
      index.ts              dispatch wrapper (getActiveProvider, listRecent*)
      openobserve.ts        DataFusion SQL → spans
      app-insights.ts       KQL → spans
      shared.ts             session aggregation, identity, common mappers
      conventions.ts        canonical attribute → dotted/underscore key catalog
      trace-category.ts     classifyTraceCategory

  src/features/inspect/logic/       inspector-view pure logic
    turns.ts                per-turn token / cost / duration rollup
    tools.ts                resolveToolCalls, collectToolGroups, collectFrontendTools
  src/features/mcp/                 MCP registry + live tools/list fetch

  src/routes/<feature>/-data.ts     server fn + queryOptions per route
  src/server/                       server-only DB code (Drizzle)
  src/db/                           Drizzle schema + client
```

Rules:

- `lib/*` never imports React or DB. Routes glue lib → DB → React Query.
- One classifier. Providers normalize key *shape*; they never decide field *meaning*.
- Local SQLite stores app state only — inbox, notes, scores. **Never** telemetry.

## Read next

| Topic | Doc |
| ----- | --- |
| Convention spec (what producers emit, what loupe reads) | [`02-spec.md`](02-spec.md) |
| Classifier rules | [`03-classify-span.md`](03-classify-span.md) |
| Sessions roll-up logic | [`sessions-vs-live.md`](sessions-vs-live.md) |
| Attribute catalog (full OTel + extensions) | [`../reference/ai-attributes.md`](../reference/ai-attributes.md) |
| Provider details | [`../reference/telemetry-providers.md`](../reference/telemetry-providers.md) |
