---
title: Datasets
type: explanation
summary: Named, versioned sets of questions fired at the user's agent over HTTP;
         answers link back to their traces and are compared across runs. Why the
         data model splits Examples from Runs, reuses session-id trace linkage, and
         splits a saved Target (server + auth) from an Identity (dev-user credentials).
status: draft
owner: "@ivan"
audience: loupe-devs
last-reviewed: 2026-06-28
tags: [datasets, evaluation, traces]
---

# Datasets

A dataset is a saved set of questions you fire at your agent repeatedly to see if
it still behaves — a regression set, a QA-owned suite, or a test-first scratchpad.
This doc explains the mental model and why it's shaped the way it is.
Output grading is covered in [evaluation.md](evaluation.md).

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
edit questions, and a **Runs** tab listing every run as a checkbox list — tick one
to read it, tick two or more to compare them side by side. A RunItem's execution
status (ok / error) and its judge verdict (pass / fail) are two independent axes,
and compare highlights what regressed or improved between baseline and current.

**Trace linkage reuses existing session grouping.** loupe already groups traces by
`gen_ai.conversation.id` / `ag_ui.thread_id`. A run mints a unique id per
(run, example) call and passes it as that conversation/thread id; the agent echoes
it onto its spans, exactly like any normal request. loupe then links each answer to
its trace by the id it *already* groups on — no bespoke `loupe_*` metadata namespace.

This is the load-bearing difference from Arize/Braintrust: because loupe is
trace-native, every answer in the grid is one click from its full trace, and a
dataset grows directly out of real traffic (capture-from-trace) rather than an SDK
harness.

## Targeting and auth

The agent under test is usually authenticated, and the driving use case is fast
dev-user switching — a tester re-runs as *Company A / User B*, then another. So two
saved objects, split on purpose (`src/db/schema.ts`):

- **Target** — a saved server: `endpointUrl` plus the *static* auth handshake
  (`authEndpoint`, `tokenPath`, tenant headers). The Run sheet picks one from a
  dropdown, or "Custom URL" for a one-off endpoint.
- **Identity** — a dev-user: normally just `credentials` (username/password). The
  handshake comes from the Target, so adding a user is two fields, not a full config.
  A "Full config" toggle exposes raw JSON to override the Target's handshake.

A run resolves `(Target, Identity)` into one `AuthContext`, mints a bearer token, and
injects it. The reasons it's shaped this way:

- **`mintToken` is a fork seam, not a registry.** Core ships a naive default (POST
  `credentials` to `authEndpoint`, read `tokenPath`); a fork patches that one function
  in its own tree for a real IdP. No `src/extensions/`, no plugin table
  (`src/features/evaluation/server/agent-auth.ts`).
- **`callAgent` stays auth-dumb.** Minting, the per-`(target,identity)` token cache
  (expiry from the token's own `expires_in`, refresh-ahead, single-flight), and the
  401→re-mint-once retry all live in the runner — the caller just takes `headers`.
- **A token is never persisted.** Dev creds in local `dev.db` are fine (test envs),
  but the minted token must not leak into a run record. The stored `rawJson`,
  `errorText`, and `endpointUrl` are scrubbed of token / header secrets / URL userinfo
  before write; a run stamps only the `identityLabel`, for audit.

## Trade-offs and non-goals

- **Dumb-target core, auth in the runner.** loupe POSTs `{input}` to an endpoint
  (saved Target → per-dataset override → global default) and records what comes back.
  Auth is layered on without touching that transport (see Targeting and auth).
  Agent-behavior **overrides** (model / system-prompt / tools / sampling) are set in
  the New run sheet and sent as extra request fields that only opt-in agents honor.
- **Tool grading reads a snapshot, not the live trace.** A run snapshots each
  trace's tool calls into `dataset_run_item.tool_calls_json`, so a `tool_selection`
  judge (or an `expected` like `{"tool":"multiply"}`) grades real behavior even
  after the provider expires the trace — captured, like Braintrust, rather than
  reconstructed at judge time. See [evaluation.md](evaluation.md) for the judge path.
- **Not a playground.** loupe does not author prompts (Arize's Playground model); the
  agent owns its prompt and tools. We only hand it inputs and optional overrides.
- **Run-comparison here, trace-diff elsewhere.** Comparing dataset runs lives in this
  feature; diffing two arbitrary trace trees is a separate concern.

## Open questions

- <TODO: run execution — sync server fn now, migrate to background job + polling
  before large datasets / slow agents are real.>
- <TODO: versioning granularity — auto per-mutation is the decision; confirm once
  storage lands.>
