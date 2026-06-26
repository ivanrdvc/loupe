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

The loupe agent is a chat panel embedded in the shell. It reads the user's *live*
telemetry — the same traces/sessions/tools every loupe page shows — and explains
it in prose: walk a trace, find the slow step, say why a tool failed. The bet is
moving the product from "what happened" (tables) to "why" (an agent that reads
the tables for you). It lives in `src/features/agent/`. This doc covers how the
loop is wired and why it dogfoods its own telemetry back into loupe.

(Naming: "the agent" here always means *this* feature; the runs it inspects are
"observed agents".)

## How it works

One request loop, client → server → telemetry providers and back:

- **Client** (`components/`). `AgentProvider` holds the per-browser feature flag
  and open/closed state; `AgentLauncher` is the launch button; `AgentPanel` is a
  right-side push panel (a flex sibling of the content, so the page shrinks
  rather than being overlaid). `AgentChat` runs the AI SDK `useChat` hook against
  `/api/chat`; `AgentMessage` renders text + a single reasoning block. The panel
  derives a `PageContext` (current pathname, and the `?trace=`/`?session=` the
  user is viewing) and sends it with every turn.
- **Route** (`src/routes/api/chat.ts`). A thin `streamText` call: resolve the
  model, build the system prompt from `PageContext`, expose `agentTools`, loop up
  to 8 steps, stream back. No business logic lives here.
- **Tools** (`server/tools.ts`). Seven read-only tools over the telemetry
  provider — `get_trace`, `get_session`, `list_recent_traces`,
  `list_recent_sessions`, `get_tool_result`, `get_logs`,
  `list_observed_agent_tools`. They return **compact summaries**, never raw
  prompts or tool payloads: `logic/summarize.ts` reduces a span set to duration,
  tokens, cost, errors (with exception type + a head/tail-trimmed stack), slowest
  steps, and the ordered step path. For the heavy stuff (messages, tool I/O) a
  tool returns a `link` field and the model surfaces it as a deep link into the
  inspector drawer.
- **Grounding** (`server/prompt.ts`). The system prompt is a fixed base plus two
  context sources: the `PageContext` ("the user is viewing trace X"), and an
  optional **observed-project profile** read fresh each turn from
  `agent-profile.md` (a fork or user describes the agent being observed, so
  answers are specific, not generic telemetry-speak).
- **Models** (`server/models.ts`, `chat-models.ts`). BYO key from env — OpenAI
  Responses (`gpt-5-nano`) or Azure — selected in the composer, persisted per
  browser.

## Dogfooding: the agent is itself an observed agent

It emits its own OTel GenAI-semconv spans into the local OpenObserve, so it
appears on `/traces` and `/sessions` exactly like any agent loupe watches — a
trace per turn, with `chat`, `execute_tool`, and `invoke_agent` spans, token
usage, and cost. Wiring lives in `server/telemetry.ts`:

- The AI SDK only *creates* spans; it never ships them. We build a
  `NodeTracerProvider` + `BatchSpanProcessor` → OTLP exporter aimed at
  OpenObserve, cached on a global symbol so vite SSR's HMR reuses one processor.
- Vercel's first-party `@ai-sdk/otel` `OpenTelemetry` integration emits the
  GenAI semconv natively — exactly [the operating set loupe reads](02-spec.md).
  No reader-side translation; `classify-span` is untouched.
- We pass the integration **per call** (`experimental_telemetry.integrations`)
  with our tracer handed in directly, rather than registering it globally —
  under vite SSR the `@opentelemetry/api` global the SDK reads from can be a
  different module instance, silently dropping spans.
- loupe groups spans into sessions by `gen_ai.conversation.id`, which the AI SDK
  has no concept of. The client sends its `useChat` id as `conversationId`; the
  integration's `enrichSpan` stamps it onto every span.

Two sharp edges worth knowing: the integration needs **ai@7+** (ai@6 only spoke
the legacy `ai.*` dialect), and the exporter must be **protobuf**, not JSON —
OpenObserve's OTLP/JSON endpoint mis-parses `doubleValue` attributes and 400s the
whole batch.

## Trade-offs and non-goals

- **Read-only.** Tools only read telemetry. The agent can't create datasets or
  trigger evals yet; the prompt tells it to say "coming soon".
- **Summaries, not payloads.** Tools deliberately exclude `llmInput` /
  `llmOutput` / `toolResult` from summaries — they bloat the context and the
  inspector already shows them. The model deep-links instead of pasting.
- **No persistence.** A conversation lives in the panel; remounting (the "+"
  button) resets it. There's no stored thread — `conversationId` exists for span
  grouping, not history.
- **Feature-flagged**, per browser, toggled from `/admin` (temporary — see
  `TODO.md`).
- **Tool-call cards aren't rendered.** Tools run server-side; the UI shows the
  final prose + one reasoning block, not per-tool cards.

## Open questions

- <TODO: promote the feature flag out of per-browser localStorage / `/admin`.>
- <TODO: write actions (create dataset, trigger eval) once the read loop proves out.>
