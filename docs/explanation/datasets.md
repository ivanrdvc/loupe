---
title: Datasets
type: explanation
summary: Named, versioned sets of questions fired at the user's agent over HTTP;
         each question shows its latest answer inline, linked back to its trace. Why the
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
- **Run** — one firing of one-or-more examples against the agent at a moment in time
  (a "Run all" hits every question; a per-row run hits one). A **RunItem** is the
  answer to one example in one run, carrying the agent's output, status, latency, and
  the `traceId` of the trace that call produced. Runs are immutable snapshots and a
  run records the config it used (agent, overrides), so history stays self-describing.

The dataset detail page (`src/routes/datasets/$datasetId.tsx`) is a **single table of
questions** — no tabs. Each row shows the question, its **latest** answer, the
expected, and the score, all inline; run a row with its ▸ button or **Run all** up
top, and the answer fills in place (latest run wins). Clicking a row expands it
inline to the full question / answer / expected / score / metadata, the **source**
and **answer** trace links, and an optional, collapsed **Previous answers** disclosure
listing that question's earlier runs (time · verdict · answer) — history is opt-in per
question, never a separate tab or list. A RunItem's execution status (ok / error) and
its judge verdict (pass / fail) remain two independent axes.

**Trace linkage reuses existing session grouping.** loupe already groups traces by
`gen_ai.conversation.id` / `ag_ui.thread_id`. A run mints a unique id per
(run, example) call and passes it as that conversation/thread id; the agent echoes
it onto its spans, exactly like any normal request. loupe then links each answer to
its trace by the id it *already* groups on — no bespoke `loupe_*` metadata namespace.

This is the load-bearing difference from Arize/Braintrust: because loupe is
trace-native, every answer in the table is one click from its full trace, and a
dataset grows directly out of real traffic (capture-from-trace) rather than an SDK
harness.

## Targeting and auth

The agent under test is usually authenticated, and the driving use case is fast
dev-user switching — a tester re-runs as *Company A / User B*, then another. So two
saved objects, split on purpose (`src/db/schema.ts`):

- **Target** — a saved server: `endpointUrl` plus the *static* auth handshake
  (`authEndpoint`, `tokenPath`, tenant headers). The **Run settings** sheet picks one
  (labelled **Agent**) from a dropdown, or "Custom URL" for a one-off endpoint.
- **Identity** — a dev-user: normally just `credentials` (username/password). The
  handshake comes from the Target, so adding a user is two fields, not a full config.
  A "Full config" toggle exposes raw JSON to override the Target's handshake. Picked in
  Run settings as **Run as**.

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

## Protocol adapters

A Target's agent doesn't have to speak the same wire protocol as the next one, so the
transport is pluggable per Target (`src/features/evaluation/server/agent-run.ts`):

- **`openai-responses` (default)** — POST the OpenAI Responses shape (`input`,
  `conversation_id`, `tools`), read `output_text` + `usage`. This is what `callAgent`
  has always done; any Responses-compatible agent needs zero code, just a Target URL.
- **`vercel-ai-stream`** — POST `{ messages }` and read the AI SDK UI-message stream,
  accumulating `text-delta` parts into the answer. This is the protocol loupe's *own*
  `/api/chat` emits, so loupe can run its own agent as the agent-under-test (dogfooding).
  Token usage isn't in that stream — it lands in OTel — so the run records `tokens: 0`
  and you read usage back from the resolved trace.

An adapter is just a function `(AgentCallInput) => AgentCallResult`. Selection is a single
field on the Target's config (`AgentTargetConfig.adapter`, default omitted =
`openai-responses`), surfaced as a **Protocol** dropdown in *Manage targets*. Adding a
third protocol is one function plus one entry in the `ADAPTERS` map (`resolveAdapter`) —
the same fork philosophy as `mintToken`: a lookup of pure functions, **not** a registry or
plugin table. The auth wrapper (`createAuthenticatedAgentCaller`) calls the chosen adapter,
so minting / retry / scrubbing are unchanged regardless of protocol.

## Trade-offs and non-goals

- **Dumb-target core, auth in the runner.** loupe POSTs the input to an endpoint
  (saved Target → per-dataset override → global default) over the Target's protocol
  adapter, and records what comes back.
  Auth is layered on without touching that transport (see Targeting and auth).
  Agent-behavior **overrides** (model / system-prompt / tools / sampling) live behind
  the Run settings sheet's **Config** disclosure and are sent as extra request fields
  that only opt-in agents honor. The **Score** setting there picks an evaluator to
  auto-grade after each run (or "Don't score"); grading itself is in [evaluation.md](evaluation.md).
- **Tool grading reads a snapshot, not the live trace.** A run snapshots each
  trace's tool calls into `dataset_run_item.tool_calls_json`, so a `tool_selection`
  judge (or an `expected` like `{"tool":"multiply"}`) grades real behavior even
  after the provider expires the trace — captured, like Braintrust, rather than
  reconstructed at judge time. See [evaluation.md](evaluation.md) for the judge path.
- **Not a playground.** loupe does not author prompts (Arize's Playground model); the
  agent owns its prompt and tools. We only hand it inputs and optional overrides.
- **Latest-wins, history opt-in.** The page shows each question's latest answer, not a
  runs list or a side-by-side baseline/compare grid — that machinery was dropped to keep
  the surface simple. Earlier runs are still recorded and reachable per question via the
  row's **Previous answers** disclosure; run-over-run comparison is a non-goal here.

## Open questions

- <TODO: run execution — sync server fn now, migrate to background job + polling
  before large datasets / slow agents are real.>
- <TODO: versioning granularity — auto per-mutation is the decision; confirm once
  storage lands.>
