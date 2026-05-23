---
title: Span classification
type: explanation
summary: One function owns every rule for turning raw OTel attributes
         into a Span's GenAI-shaped fields. Why it lives in one file,
         what it handles, and how to add a new provider.
status: stable
owner: "@ivan"
audience: agentops-devs
last-reviewed: 2026-05-12
tags: [ingest, span-classification]
---

# Span classification

One function — `classifySpan(name, attrs)` in `src/lib/classify-span.ts` — owns every rule for turning OTel attributes into a `Span`'s GenAI-shaped fields. All ingest paths call it. There is no second copy.

## Shape

```
OpenObserve provider ──► raw attrs ──┐
                                     │
Ingest push endpoint ──► raw attrs ──┼──► classifySpan(name, attrs) ──► Classification
                                     │
App Insights provider ─► raw attrs ──┘     (operation, model, agentName, toolName,
                                            tokens, costUsd, llmInput/Output, ...)
```

Each provider's job is: fetch from its backend, hand over the raw attribute bag plus the span name. Provider-shaped concerns (auth, SQL, time windows, nanosecond → ms) stay in the provider. Attribute-shaped concerns (which key forms count, which fallbacks apply) live in the classifier.

## What the classifier handles

- **`operation`** — chat / invoke_agent / tool / http. Reads `gen_ai.operation.name` (or `gen_ai_operation_name`); accepts OTel GenAI variants `text_completion`, `generate_content`, `create_agent`. Falls back to parsing the span name (`chat …`, `invoke_agent …`, `execute_tool …`).
- **`model`** — `gen_ai.{request,response}.model` in dotted and underscore forms.
- **`tokens`, `costUsd`** — `gen_ai.usage.total_tokens` / `gen_ai_usage_total_tokens` / `llm_usage_tokens_total`, similar for cost. Accepts numeric strings (OpenObserve serializes some `SUM()` aggregates as strings).
- **`agentName`** (on `invoke_agent`) — attr `gen_ai.agent.name`, falling back to parsing `"invoke_agent Explorer(…)"` out of the span name. Helper `extractAgentName` is exported because `hitToSummary` (the trace-list roll-up) needs the same parser.
- **`toolName`, `toolCallId`, `inputParams`, `toolResult`** (on `tool`) — `gen_ai.tool.*` attrs, with span-name fallback for `toolName`.
- **`llmInput`, `llmOutput`** (on `chat`) — OTel `gen_ai.{input,output}.messages` first, then Logfire / OpenLLMetry `llm_input` / `llm_output` (dotted and bare).

## Why it lives in one file

Two ingest paths used to do the same job with different rules. The same Logfire span (`text_completion`) classified as `chat` through OpenObserve and `http` through the push endpoint — same data, different `Operation`, different UI. The duplication was small (~250 LOC across two files) but the drift was free to grow every time a new framework or attribute vocabulary was added.

The classifier is intentionally **not** a registry of priority-ordered mappers (Langfuse-style). At two backends and one vocabulary, a flat function is simpler. If we grow past that — adding `openinference.span.kind` translation, framework-specific span subtypes like Vercel AI SDK's `ai.toolCall`, or a third provider — promote each section to a named mapper with a `canMap`/`map` pair. The function shape stays the same; only the internals change.

## Adding a new provider

1. New file under `src/lib/telemetry/`.
2. Fetch from your backend; turn each row into `{ name, attrs }`.
3. `...classifySpan(name, attrs)` into the `Span` you return.
4. Don't reimplement attribute lookup. If your backend names something weirdly, normalize key names in the provider before passing the bag in.
