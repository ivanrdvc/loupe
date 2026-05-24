---
title: Agentops convention spec
type: explanation
summary: The curated subset of OTel + extensions agentops operates on.
  What producers emit, what agentops reads, what gets stamped consumer-side.
status: stable
owner: "@ivan"
audience: agent-instrumentation authors, agentops-devs
last-reviewed: 2026-05-24
tags: [convention, spec, ingest, attributes]
---

# Agentops convention spec

The curated operating set. [`reference/ai-attributes.md`](../reference/ai-attributes.md) catalogs every attribute that exists in OTel / Logfire / OpenInference; this doc lists only what agentops actually reads, stamps, or expects producers to emit, with values and intent.

## Decision

Adopt OTel GenAI semconv for per-call attributes and run-graph identity (`gen_ai.task.id` / `gen_ai.task.parent.id`). Keep agentops-defined `task.*` and `session.*` namespaces for scheduling identity (no overlap with OTel). Consumer-side normalisation fills in missing run-graph attrs from span-tree shape.

No new vendor namespace. Where an existing convention covers a concept, use it.

## Attribute spec

| Concept | Attribute | Values | Source | Status |
| ------- | --------- | ------ | ------ | ------ |
| Scheduling identity (what fires) | `task.id` | string | agentops convention | read |
| Scheduling kind | `task.kind` | `cron` \| `one_shot` \| `event` \| `webhook` | agentops convention | read |
| Schedule descriptor | `task.schedule` | cron expression or ISO timestamp | agentops convention | read |
| Human label | `task.name` | string | agentops convention | read |
| Origin (URL, source) | `task.source` | string | agentops convention | read |
| Trigger type | `session.trigger_type` | `scheduled` \| `event` \| `webhook` \| `user` | agentops convention | read |
| Async execution flag | `session.execution` | `background` | agentops convention | read (operational marker, not a task kind) |
| Session id (multi-turn) | `gen_ai.conversation.id` | string | OTel GenAI semconv | read |
| AG-UI thread id | `ag_ui.thread_id` | string | AG-UI | read (alias for conversation.id) |
| User id | `user.id` | string | OTel | read |
| Utility purpose tag | `gen_ai.operation.purpose` | e.g. `title_generation` | proposed in OTel | read |
| Operation kind | `gen_ai.operation.name` | `chat` \| `embeddings` \| (future: `retrieve`, `rerank`) | OTel GenAI semconv | read (`chat` today; `embeddings` when first RAG producer arrives) |
| Run-graph node id | `gen_ai.task.id` | string (often the span_id) | external convention | read; stamped consumer-side when absent |
| Run-graph parent id | `gen_ai.task.parent.id` | string (null on top-level) | external convention | read; stamped consumer-side when absent |
| User-supplied tags | `tag.tags` | list of strings | external convention | not yet read; for filter chips / faceted grouping |

The orchestrator/subagent/utility distinction is **derived**, not stored:
- `subagent` ⇔ `gen_ai.task.parent.id` is set
- `utility` ⇔ `gen_ai.operation.purpose` is set
- `orchestrator` ⇔ neither

Aliases the normaliser accepts on ingest: `graph.node.id` / `graph.node.parent_id` map to `gen_ai.task.id` / `gen_ai.task.parent.id`.

## Two `task.*` namespaces — disambiguation

- `task.*` = the **scheduling identity** — what fires, why, on what cadence.
- `gen_ai.task.*` = the **run-graph node identity** — which node in the agent's execution graph is this span.

They coexist by purpose. A scheduled cron job (root span carries `task.kind=cron`) might internally invoke three sub-agents (each carrying its own `gen_ai.task.id` and a `gen_ai.task.parent.id` pointing at the orchestrator).

## Producer emission checklist

What the **root span** of each trace category must carry. Child spans only need run-graph attrs.

| Category | Root span attrs |
| -------- | --------------- |
| `chat` | `gen_ai.conversation.id` OR `ag_ui.thread_id` |
| `sub-agent` | nothing new on root (`execute_tool` is the root). Nested `invoke_agent` carries `gen_ai.task.parent.id` pointing at the parent invoke_agent's `gen_ai.task.id` |
| `scheduled` (cron) | `session.trigger_type=scheduled`; `task.id`; `task.kind=cron`; `task.schedule=<cron expression>`; `task.name`; optional `task.source` |
| `scheduled` (one-shot) | `session.trigger_type=scheduled`; `task.id`; `task.kind=one_shot`; `task.schedule=<ISO timestamp>`; `task.name`; optional `task.source` |
| `event` | `session.trigger_type=event`; `task.id`; `task.kind=event`; `task.source=<event source>`; `task.name=<event name>` |
| `webhook` | `session.trigger_type=webhook`; `task.id`; `task.kind=webhook`; `task.source=<URL or route>`; `task.name=<route>` |
| `background` | `session.trigger_type=user`; `session.execution=background`. Operational marker — surfaces as a Traces filter only, **not** a task kind |
| `utility` | `gen_ai.operation.purpose=<tag>` |
| `orphan` | nothing — fallback bucket |

`background` is an execution-mode marker, not a trigger. It lives on `/traces` as a filter and never rolls up on `/tasks`.

## Mechanism

Consumer-side normalisation at fetch time. The single pass in `src/lib/spans.ts` (post-getTrace) reads structural shape and stamps `gen_ai.task.id` (= span_id) and `gen_ai.task.parent.id` (= nearest ancestor `invoke_agent`'s task id, or null on top-level) onto each `invoke_agent` span in memory. The rest of the codebase reads attributes.

Pass-through: when a span arrives already carrying these attrs (Traceloop producers, LangGraph via the `graph.node.*` alias, anyone emitting them natively), the normaliser trusts the producer and skips its own stamping.

Why the work runs in agentops rather than producer-side or in an OTel Collector: OTTL transform processors are strictly per-span (can't dereference `parent_span_id` to walk ancestors), and we don't want to ship a producer-side SDK processor in two languages. Fallback inference rules + topology shapes: [`01-architecture.md`](01-architecture.md).

## Rendering

A span's UI surface is determined by what the span *is*, not by `gen_ai.task.*`. The normaliser stamps run-graph attrs for in-trace use (subtree focus inside the trace-detail tree, parent linkage in the per-trace drawer) — it does **not** drive a new list-level surface.

- **Root spans** appear on `/traces` (Traces tab), one row per `trace_id`, classified by [`trace-category.ts`](../../src/lib/telemetry/trace-category.ts).
- **Sub-agent spans** (`invoke_agent` whose parent is `execute_tool`, or any span with `gen_ai.task.parent.id` set) appear on `/traces?tab=spans` with `kind=sub-agent`. They are not promoted to Traces rows — a sub-agent is a nested span, not a trace.
- **Utility spans** (`gen_ai.operation.purpose` set, non-root) appear on `/traces?tab=spans` with `kind=utility`. A utility emitted as its own trace lands on the Traces tab instead (`category=utility`).

See [`sessions-vs-live.md`](sessions-vs-live.md) for the full per-tab matrix.

### Rejected — sub-agents as first-class Traces rows

Earlier proposal: promote any span with `gen_ai.task.parent.id` to its own row on `/traces` (keyed by `gen_ai.task.id`) and shrink the Spans tab to utility-only.

**Rejected.** A sub-agent invocation is one span — it is not a root. Treating it as a row on the Traces tab would conflate `trace_id` (the unit a Traces row keys on) with span identity, and create two surfaces that show the same execution. Sub-agents stay on the Spans tab alongside utility spans, where every row is by definition a nested span surfaced on its own. The normaliser still stamps `gen_ai.task.*` for in-trace use (subtree focus, drawer scoping inside trace detail) — it just doesn't drive a new list-level surface. Matches prior art: Phoenix surfaces sub-agents via a filterable flat Spans list; Langfuse / LangSmith keep them nested under the parent trace.
