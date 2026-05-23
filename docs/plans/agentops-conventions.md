---
title: Agentops conventions rollout
type: plan
summary: Two-phase rollout of the convention spec — producer emission first,
  consumer normaliser second. Prior art appendix.
status: in-progress
owner: "@ivan"
audience: agentops-devs
last-reviewed: 2026-05-24
tags: [convention, rollout, normaliser, ingest]
---

# Agentops conventions rollout

Plan for getting the [convention spec](../explanation/02-spec.md) deployed end-to-end. Volatile — updates as work lands.

## Two-phase rollout

### Phase 1 — works today with the current agentops consumer

Everything in the "read" rows of the spec table. Agent-run-test must emit these for the agentops dashboard to render the right thing on every page.

### Phase 2 — needs agentops consumer normalisation work

`gen_ai.task.id`, `gen_ai.task.parent.id`. Emit these from producers too — they'll be no-ops until agentops grows the normaliser, but they make the data forward-compatible. Not blocking phase 1.

## Agent-run-test concrete diffs

In `agent/Demos.cs`:

1. **Add a cron scenario** alongside the existing one-shot at `/demo/scheduled`. Stamp `task.kind=cron` and `task.schedule="0 */6 * * *"` (or similar). Fire multiple times over time so the agentops cadence renders. New endpoint or query param to distinguish from one-shot.
2. **Add `task.name`** to the scheduled / event / webhook / background paths. Use a descriptive label (e.g. "morning standup", "github.pull_request.opened", "POST /webhooks/stripe").
3. **Add `task.source`** to event / webhook / background paths. Event source URI, webhook URL, or the user/agent identifier that triggered the background work.
4. **Phase 2 (optional now)**: stamp `gen_ai.task.id` (= the span id) on every `invoke_agent` span. Stamp `gen_ai.task.parent.id` (= parent invoke_agent's task id, null on top-level) on nested `invoke_agent` spans.

## Agentops consumer plan

1. **Normaliser** — collapse the inference in `src/lib/spans.ts` into one pass that runs after `getTrace` / `listTraces` and writes `gen_ai.task.id`, `gen_ai.task.parent.id` onto each `invoke_agent` span. Rest of the codebase reads attributes.
2. **Pass-through skip** — if a span arrives with those attrs already set, don't overwrite.
3. **Sub-agents as first-class rows** — `/traces` shows spans with `gen_ai.task.parent.id` set as their own rows, keyed by `gen_ai.task.id`. Parent trace_id is a chip/link, not row identity. The Spans tab shrinks to "utility purposes only" or disappears.
4. **Drawer scoping** — when a sub-agent row is clicked, the drawer renders the subtree rooted at that span, not the whole parent trace.

Schedule a separate PR per item.

## Prior art

Researched the live state of OTel GenAI semconv + Traceloop + OpenInference + Langfuse + Logfire.

**OTel GenAI (stable Q1 2026)** — `gen_ai.agent.id|name|description|version`, `gen_ai.conversation.id`, `gen_ai.workflow.name`. Span names `create_agent` / `invoke_agent` / `invoke_workflow`. No topology, no parent linkage. Working-group meta-proposal: [open-telemetry/semantic-conventions#2664](https://github.com/open-telemetry/semantic-conventions/issues/2664) (Aug 2025) — `gen_ai.team.*` is the closest topology bucket on the table. Months away.

**Traceloop / OpenLLMetry** — ships `gen_ai.task.id`, `gen_ai.task.parent.id`, `gen_ai.task.kind` (workflow | task | agent | tool | unknown). Also `gen_ai.workflow.nodes/edges` (full graph on a single span — too heavy for our needs). This is the closest match; we adopt the first two.

**OpenInference (Arize Phoenix)** — `openinference.span.kind` (LLM | AGENT | CHAIN | TOOL | RETRIEVER | EMBEDDING | RERANKER | UNKNOWN), `graph.node.id` / `graph.node.parent_id`. RAG-flavoured. We don't adopt the enum (the orchestrator vs subagent distinction doesn't map to span.kind), but we accept `graph.node.*` as alias for `gen_ai.task.*` on ingest. Adopted `tag.tags` for user-supplied labels.

**Langfuse / Pydantic Logfire** — rely on native span parent-child nesting. No cross-vendor topology attrs.

**OTel Collector OTTL** — confirmed strictly per-span. Scope is `resource | scope | span | spanevent`. You can read/write `parent_span_id` as a value but cannot dereference it. No ancestor walk. Kills the "collector YAML stamps topology" plan; that's why normalisation runs in agentops consumer code.

## Open

- Sub-agent rendering once the normaliser lands: confirm `gen_ai.task.parent.id IS NOT NULL` is the right "this is a sub-agent" predicate in the Traces tab, vs the current structural `root execute_tool wraps invoke_agent` check that runs on the trace level.
