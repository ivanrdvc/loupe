---
title: Telemetry providers
type: reference
summary: How agentops reads spans from each backend (OpenObserve, Application
  Insights, ...), the row → Span mapping, and the trace-scope
  post-processing every provider runs before returning data.
status: stable
owner: "@ivan"
audience: anyone touching src/lib/telemetry/*
last-reviewed: 2026-05-15
tags: [telemetry, openobserve, app-insights, normalization]
---

# Telemetry providers

agentops doesn't store telemetry. Every read goes through a provider in
`src/lib/telemetry/` that translates the backend's row shape into the internal
`Span` type. The rest of the codebase — drawers, trees, conversation views,
query keys — only ever sees `Span[]`. Provider-specific knowledge stops at the
boundary.

This page describes that boundary: what the contract is, what each provider
does to honor it, and where to add the next one.

## The Span contract

A provider returns `Span[]` with:

- `id` / `traceId` / `parentId` — all strings; `parentId` is `null` only for
  trace roots, and points to a span that exists in the same returned set
  otherwise.
- `startMs` / `endMs` — milliseconds since epoch.
- `operation` — one of `chat`, `tool`, `invoke_agent`, `http` (from
  `classifySpan`).
- `sessionId` / `sessionSource` — populated for every span. Source is
  `attribute` when lifted from `ag_ui_thread_id` and friends, or `trace` when
  no such attribute is present. Only `attribute`-sourced sessions appear in
  the sessions list; `trace`-sourced ones are reachable only via direct URL.
- Token, cost, model, prompt/response payloads when present.

Consumers rely on this. If a renderer has to special-case a backend, the bug
is in the provider, not the renderer.

## Trace-scope post-processing

After a provider maps rows → `Span[]`, two passes run per trace before
returning. They live in `src/lib/spans.ts` so every provider shares them.

- **`normalizeTraceRoots(spans)`** — sets `parentId = null` for any span whose
  declared parent isn't present in the result set. Some backends emit a
  non-empty `parentId` on root spans (OpenObserve writes the trace id there);
  without this pass, the tree builder has nothing to walk from.
- **`propagateSessionInTrace(spans)`** — finds the trace's resolved `sessionId`
  and stamps it on spans that didn't carry one themselves. A real
  attribute-derived id wins; otherwise every span in the trace is stamped
  with the trace id (source `trace`) so the trace appears as its own session.

Single-trace fetches call both passes on the flat result. Multi-trace fetches
(`getSession`) group by `traceId` first and run the passes per trace, because
each trace has its own root and may carry a different session-id source.

## OpenObserve

`src/lib/telemetry/openobserve.ts`. Queries the OO HTTP search API over SQL,
scoped by a time window in microseconds.

Row mapping (`normalizeOpenObserveHit`):

- `span_id` / `trace_id` → `id` / `traceId`.
- `reference_parent_span_id` → `parentId`. Empty string becomes `null`. Roots
  may carry the trace id here rather than empty — `normalizeTraceRoots`
  reconciles this after the per-row pass.
- `start_time` and `end_time` are nanoseconds → divided to ms. `duration` is
  microseconds (unused; we derive duration from the ms bounds).
- LLM and agent attributes come through flat columns that `classifySpan`
  picks up.

Optional columns are not guaranteed to exist in the stream
(`ag_ui_thread_id`, `ag_ui_thread_title`, `llm_input`, user-identity columns).
`searchDroppingMissing` handles this: when OO returns code `20004` naming a
missing field, the helper drops that field from `SELECT` / `WHERE` and retries.
The set of optional fields is declared at each call site.

Session detail (`getSession`) is a two-step query: resolve trace ids, then
bulk-fetch all spans for those traces. Both steps run inside the requested
time window. The bulk-fetch can drop the root row of a long-running trace when
the window starts after the trace did; `normalizeTraceRoots` keeps the view
consistent in that case.

## Application Insights

`src/lib/telemetry/app-insights.ts`. Queries the AI query endpoint using KQL;
column names and table layout differ from OO.

Row mapping (`normalizeAiRow`):

- `id` → `id`; `operation_Id` → `traceId`; `operation_ParentId` → `parentId`.
- AI splits a trace across two tables: `requests` (server entries) and
  `dependencies` (outbound calls, including LLM and tool spans). Queries
  `union` them.
- Per-span attributes live in `customDimensions` (JSON-encoded). They're
  parsed once and fed to `classifySpan` alongside the operation name.

KQL has its own identity-filter and COALESCE helpers in the file. The
trace-scope passes apply unchanged.

## Adding a new provider

1. Implement the `TelemetryProvider` interface in
   `src/lib/telemetry/<name>.ts`. Mirror the existing providers' shape
   (`getTrace`, `getSession`, `listSessions`, etc.).
2. Write a `normalize<Name>Row(row) → Span` that converts unit and field
   names. Send LLM/agent attributes through `classifySpan`.
3. Per trace, after mapping rows: call `normalizeTraceRoots(spans)` and
   `propagateSessionInTrace(spans)` before returning.
4. Register the provider in `src/lib/telemetry/index.ts` and add an entry to
   `listProviderStatus` so the settings UI can show its configuration state.
5. If the backend has behavior that doesn't fit the contract, document it in
   this file under a new section. Don't push the workaround up into a
   renderer.

## Session id resolution

A session is a producer-declared conversation grouping. `findSessionKey` reads
a real session-id attribute (`ag_ui_thread_id`, `session.id`,
`gen_ai.conversation.id`, configured `CUSTOM_SESSION_ID_FIELDS`, …); if none
is present it returns `{ source: 'trace', id: trace_id }`.

`aggregateSessions` drops every `source: 'trace'` row — those are individual
runs, not sessions, and belong on Runs. The session-detail page still resolves
a bare `trace_id` URL because `getSession` falls back to `operation_Id`
matching, so direct links to a trace remain valid; they just don't appear in
the list.

This replaced an `invoke_agent <Name>(<hex>)` hex heuristic. Verified against
live App Insights data: the hex tracks `service.instance.id` (the process),
not a conversation, so long-lived hosted agents collapsed every request
through one process into a single row.

## TraceSummary and trace categories

`listTraces()` returns `TraceSummary[]` — one row per `trace_id`. Fields:

| Field                          | Type           | Description                          |
| ------------------------------ | -------------- | ------------------------------------ |
| `id`                           | string         | The trace id                         |
| `startedAtMs` / `durationMs`   | number         | Timing bounds                        |
| `spanCount`                    | number         | Total spans in the trace             |
| `agent`                        | string?        | First `invoke_agent` name            |
| `serviceName`                  | string?        | OTel `service.name`                  |
| `sessionId`                    | string?        | Session attribute if present         |
| `totalTokens` / `totalCostUsd` | number?        | Aggregated from chat spans           |
| `hasError`                     | boolean?       | Any span errored                     |
| `category`                     | TraceCategory? | Derived classification (see below)   |
| `hasSessionAttribute`          | boolean?       | Whether a real session key was found |
| `rootOperation`                | string?        | Name of the trace's root span        |
| `userId` / `userName`          | string?        | User identity from spans             |

### Category classification

`src/lib/telemetry/trace-category.ts` — `classifyTraceCategory(input)`. Reads producer-emitted `session.trigger_type` / `session.execution` / `gen_ai.operation.purpose` (or the deployment's `CUSTOM_LLM_PURPOSE_FIELD`); no producer-side classifier remapping.

Priority order (first match wins — pinned by `trace-category.test.ts`):

1. **scheduled** — `session.trigger_type = "scheduled"`
2. **event** — `session.trigger_type = "event"`
3. **webhook** — `session.trigger_type = "webhook"`
4. **background** — `session.trigger_type = "user"` AND `session.execution = "background"`
5. **sub-agent** — root span operation is `tool` or `mcp` AND trace has any `invoke_agent` descendant
6. **chat** — trace has any `invoke_agent` span
7. **utility** — root span carries `gen_ai.operation.purpose`
8. **chat** — trace has a session attribute
9. **utility** — trace has chat spans (fallback for raw LLM calls)
10. **orphan** — anything else

Producer-stamped trigger types win over structural inference — a scheduled trigger on a sub-agent-shaped trace still reports `scheduled`. The interleaved chat / utility branches reflect that `hasInvokeAgent` and `hasSessionAttribute` are independent signals and producers emit them inconsistently.

### Consumer-specific attribute keys

These are configured via env vars in `src/lib/telemetry/field-config.ts`:

| Env var                    | Purpose                                                |
| -------------------------- | ------------------------------------------------------ |
| `CUSTOM_LLM_PURPOSE_FIELD` | Attribute key whose presence flips category to utility |
| `CUSTOM_SESSION_ID_FIELDS` | Additional session-id attribute keys (comma-separated) |
| `CUSTOM_USER_ID_FIELDS`    | Additional user-id attribute keys (comma-separated)    |

Both providers (OO and AI) read these at startup and incorporate them into their list queries.
