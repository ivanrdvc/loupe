---
title: Datasets
type: explanation
summary: Named, versioned sets of questions fired at the user's agent over HTTP;
         answers link back to their traces and are compared across runs. Why the
         data model splits Examples from Runs and reuses session-id trace linkage.
status: draft
owner: "@ivan"
audience: loupe-devs
last-reviewed: 2026-05-30
tags: [datasets, evaluation, traces]
---

# Datasets

A dataset is a saved set of questions you fire at your agent repeatedly to see if
it still behaves — a regression set, a QA-owned suite, or a test-first scratchpad.
This doc explains the mental model and why it's shaped the way it is. For the
build plan and open decisions see [plans/datasets.md](../plans/datasets.md);
this is UI-only/mock at time of writing.

## The shape of the problem

The unit under test is the **deployed agent**, not a prompt. So loupe can't grade
a fixed string — an agent's answer is variable and the interesting signal is often
*behavior* (which tool it called, across how many turns). The feature has to:

- hold inputs that range from a single question to a multi-turn transcript;
- call an external agent over HTTP and capture both the answer and the trace it
  produced;
- let you re-fire the same set later and see what changed.

## How it works

Two objects, deliberately separate:

- **Example** — one test case: `input` (a string *or* a `ChatMessage[]` transcript),
  optional `expected` (a reference answer, a tool-call assertion, or a judge rubric),
  `metadata`, and an optional `sourceTraceId` backlink to the trace it was captured
  from. Examples are the editable questions.
- **Run** — one firing of every example against the agent at a moment in time. A
  **RunItem** is the answer to one example in one run, carrying the agent's output,
  status, latency, and the `traceId` of the trace that call produced. Runs are
  immutable snapshots; comparing runs is how you spot regressions.

The grid is Examples (rows) × Runs (columns). In the UI these are two tabs on the
dataset detail page (`src/routes/datasets/$datasetId.tsx`): an **Examples** tab to
edit questions, and a **Runs** tab that shows the latest run by default with prior
runs as a quiet pill switcher (tap to view, tap more to compare).

**Trace linkage reuses existing session grouping.** loupe already groups traces by
`gen_ai.conversation.id` / `ag_ui.thread_id`. A run mints a unique id per
(run, example) call and passes it as that conversation/thread id; the agent echoes
it onto its spans, exactly like any normal request. loupe then links each answer to
its trace by the id it *already* groups on — no bespoke `loupe_*` metadata namespace.

This is the load-bearing difference from Arize/Braintrust: because loupe is
trace-native, every answer in the grid is one click from its full trace, and a
dataset grows directly out of real traffic (capture-from-trace) rather than an SDK
harness.

## Trade-offs and non-goals

- **Dumb-target first.** The first cut POSTs `{input}` to one agent endpoint
  (global default + per-dataset override) and records what comes back. Agent-behavior
  **overrides** (model / system-prompt / tools / sampling) are sent as extra request
  fields that only opt-in agents honor — UI is mocked, wired later.
- **Scoring is deferred.** Pass/fail badges, judges, and tool-call assertions are
  mocked. The `expected` field is typed as a criterion now so the data model is right,
  but nothing grades it yet.
- **Not a playground.** loupe does not author prompts (Arize's Playground model); the
  agent owns its prompt and tools. We only hand it inputs and optional overrides.
- **Run-comparison here, trace-diff elsewhere.** Comparing dataset runs lives in this
  feature; diffing two arbitrary trace trees is a separate plan
  ([compare-traces.md](../plans/compare-traces.md)).

## Open questions

- <TODO: run execution — sync server fn now, migrate to background job + polling
  before large datasets / slow agents are real.>
- <TODO: versioning granularity — auto per-mutation is the decision; confirm once
  storage lands.>
