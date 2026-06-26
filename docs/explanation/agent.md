---
title: Agent
type: explanation
summary: Embedded chat agent that reads the user's live telemetry through read-only
  tools to answer "why", and emits its own GenAI-semconv spans so it shows up in
  loupe like any observed agent.
status: stable
owner: "@ivan"
audience: loupe-devs
last-reviewed: 2026-06-27
tags: [agent, llm, tools, telemetry, ai-sdk]
---

# Agent

A chat panel embedded in the shell that reads the user's *live* telemetry — the
same traces/sessions/tools every page shows — and explains it in prose: walk a
trace, find the slow step, say why a tool failed. The bet: move from "what
happened" (tables) to "why" (an agent that reads the tables for you). Lives in
`src/features/agent/`. ("The agent" = this feature; the runs it inspects are
"observed agents".)

## How it works

One request loop, client → server → telemetry providers and back:

- **Client** (`components/`). `AgentProvider` holds the per-browser feature flag
  + open state; `AgentLauncher` opens it; `AgentPanel` is a right-side push panel
  (flex sibling of the content, so the page shrinks rather than overlays).
  `AgentChat` runs `useChat` against `/api/chat`; `AgentMessage` renders text + a
  single reasoning block. The panel sends a `PageContext` (pathname + the
  `?trace=`/`?session=` being viewed) with every turn.
- **Route** (`src/routes/api/chat.ts`). A thin `streamText`: resolve model, build
  the system prompt, expose `agentTools`, loop ≤8 steps, stream back.
- **Tools** (`server/tools.ts`). Seven read-only tools over the telemetry
  provider (`get_trace`, `get_session`, `list_recent_traces`,
  `list_recent_sessions`, `get_tool_result`, `get_logs`,
  `list_observed_agent_tools`). They return **compact summaries** via
  `logic/summarize.ts` (duration, tokens, cost, errors w/ trimmed stack, slowest
  steps, ordered step path) — never raw prompts or payloads. For the heavy stuff
  a tool returns a `link` the model surfaces as a deep link into the inspector.
- **Grounding** (`server/prompt.ts`). Fixed base + `PageContext` + an optional
  observed-project profile read fresh each turn from `agent-profile.md`.
- **Models** (`server/models.ts`, `chat-models.ts`). BYO key from env — OpenAI
  Responses (`gpt-5-nano`) or Azure — selected in the composer, persisted per
  browser.

## Dogfooding: the agent is itself an observed agent

It emits its own OTel GenAI-semconv spans into local OpenObserve, so it appears
on `/traces` and `/sessions` like any observed agent. Wiring in
`server/telemetry.ts`:

- The AI SDK only *creates* spans. We build a `NodeTracerProvider` +
  `BatchSpanProcessor` → OTLP exporter aimed at OpenObserve, cached on a global
  symbol so vite SSR's HMR reuses one processor.
- `@ai-sdk/otel`'s `OpenTelemetry` integration emits the GenAI semconv natively —
  [the operating set loupe reads](02-spec.md); no reader-side translation.
- Passed **per call** (`experimental_telemetry.integrations`) with our tracer,
  not registered globally — under vite SSR the SDK's `@opentelemetry/api` global
  can be a different module instance, silently dropping spans.
- The client sends its `useChat` id as `conversationId`; `enrichSpan` stamps it
  as `gen_ai.conversation.id` (how loupe groups spans into sessions).

Two sharp edges: needs **ai@7+** (ai@6 only spoke legacy `ai.*`), and the
exporter must be **protobuf** — OpenObserve's OTLP/JSON endpoint mis-parses
`doubleValue` attrs and 400s the batch.

## Trade-offs and non-goals

- **Read-only.** Can't create datasets or trigger evals yet; the prompt says
  "coming soon".
- **Summaries, not payloads.** Tools exclude `llmInput`/`llmOutput`/`toolResult`
  — they bloat context and the inspector already shows them; the model
  deep-links instead.
- **No persistence.** Remounting (the "+" button) resets the conversation;
  `conversationId` exists for span grouping, not history.
- **Feature-flagged** per browser, toggled from `/admin` (temporary — see
  `TODO.md`).
- **No tool-call cards.** Tools run server-side; the UI shows prose + one
  reasoning block.

## Open questions

- <TODO: promote the feature flag out of per-browser localStorage / `/admin`.>
- <TODO: write actions (create dataset, trigger eval) once the read loop proves out.>
