---
title: Architecture
type: explanation
summary: How agentops reads OTel traces, normalizes them through one classifier,
  layers session / purpose / category / sub-agent inference on top, and where
  every piece lives in the code.
status: current
owner: Ivan
audience: agentops-devs, AI assistants
last-reviewed: 2026-05-23
tags: [architecture, ingest, classification, entry-point]
---

# Architecture

agentops reads OTel traces emitted by agent frameworks, classifies the spans,
and renders agent activity. Read-only — no local telemetry mirror.

## Mental model

```
  Session  (grouped by gen_ai.conversation.id / ag_ui.thread_id / session.id /
            langfuse.session.id / openinference.session.id / $CUSTOM_SESSION_ID_FIELDS)
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

Session is the only level agentops *adds*. Trace and Span are OTel.
Span names shown above are the ones we recognize and route through the
classifier; full vocabulary in
[`reference/ai-attributes.md`](reference/ai-attributes.md).

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
        ─────────────────────────────────────────►  agentops
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
  classifySpan(name, attrs)                    ← lib/classify-span.ts
        │ • OpenInference span.kind override (explicit producer signal wins)
        │ • else: gen_ai.operation.name → span-name prefix → 'http'
        │ Classification (typed, normalized)
        ▼
  Span[] post-processing                       ← lib/spans.ts
   • dedupeById
   • normalizeTraceRoots             (orphan parents → root)
   • propagateSessionInTrace         (lift session id to nested spans;
                                      trace_id fallback if no attribute)
   • propagateInheritedAttrs         (operationName, agUiRunId from ancestors)
   • parent ↔ child linkage
   • countAgentAncestors             (topology primitive)
        │
        ▼
  route -data.ts (server fn + queryOptions)    ← src/routes/<feature>/-data.ts
        │
        ▼
  React Query → components
   • lib/conversation.ts:  Span[] → ConversationEvent[]  (chat bubbles, tool cards)
   • lib/turns.ts:         per-turn token / cost / duration rollup
   • lib/spans.ts helpers: orchestrator / sub-agent / wrapped-agent tests
```

One classifier. Providers normalize *key shape* (dotted vs underscore, row
column names); they never decide *field meaning*. That decision lives in
`classify-span.ts`, full stop.

## Span shape  (`src/lib/spans.ts`)

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

## What agentops layers on top of OTel

These are agentops-specific concepts. OTel GenAI semconv defines none of them.

**Session** — roll-up of traces sharing a conversation id.

```
  Lifted from:  gen_ai.conversation.id
                session.id
                ag_ui.thread_id
                langfuse.session.id
                openinference.session.id
                $CUSTOM_SESSION_ID_FIELDS
  Fallback:     trace_id  (sessionSource = 'trace')
```

Trace-id fallback keeps the detail page resolvable for spans without a real
session attribute; those don't appear in the sessions list (they're individual
runs).

**Purpose** — tag for utility LLM calls.

```
  Read from:    gen_ai.operation.purpose  |  $CUSTOM_LLM_PURPOSE_FIELD
  Examples:     title_generation, summarize, embed_for_search
  Propagation:  the attribute sits on an ancestor Activity, NOT on the
                nested chat span — propagateSessionInTrace lifts it down.
```

**Category** — why this trace ran. One per trace.
Implemented in `lib/telemetry/trace-category.ts` (priority order, first match wins):

```
  sub-agent    root execute_tool wraps an invoke_agent
  scheduled    session.trigger_type = scheduled
  event        session.trigger_type = event
  webhook      session.trigger_type = webhook
  background   trigger_type = user AND execution = background
  utility      root LLM purpose set, OR chat-only with no agent
  chat         trace has any session attribute
  orphan       everything else
```

Where a utility shows up follows the producer's emission shape:
- **Emitted as its own trace** (own `trace_id`, root span carries the purpose
  attr) → listed on `/traces` with category `utility`.
- **Emitted as a nested span inside a larger trace** → invisible from the
  trace list, surfaced on the Spans tab (`?tab=spans`).

The Spans tab is a flat-spans view fed by `provider.listSpans`, which
returns nested purpose-attr spans plus nested sub-agent invocations
(`invoke_agent` whose parent is `execute_tool`). Each row links to its
parent trace.

**Sub-agent inference** — no OTel attribute exists; we read it off tree shape.

```
  Primitive:    countAgentAncestors(span)   in lib/spans.ts
  Rules:
    top-level invoke_agent   ↔  zero invoke_agent ancestors
    sub-agent  invoke_agent  ↔  ≥1 invoke_agent ancestor
    agent-as-tool            ↔  execute_tool with an invoke_agent child
                                (findWrappedAgent)
```

## Trace shapes the inference handles

```
  1. Single root              invoke_agent → chat / execute_tool / chat
  2. Sibling invoke_agents    one HTTP request wraps N runs of same agent (MEAI)
  3. Agent-as-tool            execute_tool X → invoke_agent Y → chat
  3b. Agent-as-tool (flat)    execute_tool X → chat   (no inner invoke_agent)
  4. Multi-trace session      separate traces per user msg, joined by session attr
  5. Raw chat                 POST /v1/chat/completions → chat   (no agent at all)
```

Full rationale + heuristics + failure modes:
[`explanation/agent-trace-topology.md`](explanation/agent-trace-topology.md).

## Code map

```
  src/lib/                          framework-free, pure, testable
    classify-span.ts        attrs + name → Classification (single source of rules)
    spans.ts                Span type, tree helpers, topology primitive
    conversation.ts         Span[] → ConversationEvent[] (UI render input)
    turns.ts                per-turn token / cost / duration rollup
    tokens.ts               tokenizer family + breakdown math
    llm-pricing.ts          model → $/token, fills costUsd when producer omits
    telemetry/
      types.ts              TelemetryProvider interface (listTraces, listSpans,
                            listSessions, getTrace, getSession, query)
      index.ts              dispatch wrapper (getActiveProvider, listRecent*)
      openobserve.ts        DataFusion SQL → spans
      app-insights.ts       KQL → spans
      shared.ts             session aggregation, identity, common mappers
      conventions.ts        canonical attribute → dotted/underscore key catalog
      field-config.ts       env-driven attr overrides ($CUSTOM_SESSION_ID_FIELDS,
                            $CUSTOM_LLM_PURPOSE_FIELD)
      trace-category.ts     classifyTraceCategory
    mcp/                    MCP registry + live tools/list fetch

  src/routes/<feature>/-data.ts     server fn + queryOptions per route
  src/server/                       server-only DB code (Drizzle)
  src/db/                           Drizzle schema + client
```

Rules:

- `lib/*` never imports React or DB. Routes glue lib → DB → React Query.
- One classifier. Providers normalize key *shape*; they never decide field *meaning*.
- Local SQLite stores app state only — inbox, notes, alert rules. **Never** telemetry.

## Read next

| Topic                     | Doc                                                         |
| ------------------------- | ----------------------------------------------------------- |
| Topology inference (why)  | [explanation/agent-trace-topology.md](explanation/agent-trace-topology.md) |
| Classifier rules          | [explanation/classify-span.md](explanation/classify-span.md) |
| Sessions roll-up logic    | [explanation/sessions-vs-live.md](explanation/sessions-vs-live.md) |
| Data model + per-query rationale | [explanation/data-model-and-queries.md](explanation/data-model-and-queries.md) |
| MCP registry              | [explanation/mcp-read-through.md](explanation/mcp-read-through.md) |
| Code conventions          | [explanation/code-organization.md](explanation/code-organization.md) |
| Attribute key catalog     | [reference/ai-attributes.md](reference/ai-attributes.md)     |
| Provider details          | [reference/telemetry-providers.md](reference/telemetry-providers.md) |
| Plans / unbuilt           | [plans/](plans/)                                             |
