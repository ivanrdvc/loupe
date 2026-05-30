# Datasets

A way to keep a set of questions/inputs around, fire them at an agent over HTTP, and
look at the answers side-by-side over time. This plan covers **datasets + running them
only**. Scoring/eval/judges are explicitly out of scope (mocked UI placeholders now,
real later).

## Why / who uses it

Three concrete jobs this serves — all three are how the real tools (Phoenix, Langfuse,
Braintrust) describe it:

1. **Regression set** — "I have a question/prompt I keep firing to check my agent is still
   ok." Run the same set whenever, compare to last time.
2. **QA-owned set** — QA curates their own cases and tracks them, separate from dev.
3. **Dataset-first dev** — start from the question, run it, watch how the agent does as I
   build. Test-driven.

## Data model

One dataset is a **named, versioned collection of examples**. Mirrors the cross-tool model
(input + optional expected output + metadata), with loupe's trace-native twist: an example
can point back at the span/session it came from.

- **Dataset** — `id`, `name`, `description`, `tags[]`, `createdAt`, `updatedAt`.
- **Example** (a row / test case) — `id`, `datasetId`,
  - `input` — the thing we send the agent (string or JSON).
  - `expectedOutput` — optional ground truth, editable inline. Optional on purpose.
  - `metadata` — free-form key/values.
  - `sourceTraceId` / `sourceSpanId` — optional link back to where it was captured from.
- **DatasetVersion** — every add/edit/delete of examples bumps a version (timestamped).
  A run pins to the version it ran against. (Langfuse/Phoenix both do exactly this.)
- **Run** — one execution of the dataset against the agent: `id`, `datasetId`,
  `datasetVersion`, the call config used (endpoint, model, overrides — see below),
  `createdAt`, status.
- **RunItem** — one example's result in a run: `runId`, `exampleId`, `output` (agent's
  answer), `traceId` (the trace the call produced — the trace-native link), latency,
  error. Score columns exist in the shape but stay empty/mocked for now.

## Creating datasets

All paths land the same Example shape:

- **Manual** — "New dataset", then add example rows in the UI (type input + expected).
- **Capture from a trace/session** — from the inspect view, "Add to dataset" on a
  span/session: prefill `input` (and `expectedOutput` from the observed output if wanted),
  stamp `sourceTraceId`/`sourceSpanId`. This is the highest-value path and the one that
  fits loupe — datasets grow out of real traffic.
- **CSV/JSON upload** — batch import (columns → input/expected/metadata). Nice-to-have,
  can be a thin first cut.
- *(Synthetic generation — noted as a later idea, not built now.)*

## Running a dataset — the REST contract

There is **one candidate: the user's agent, called over HTTP.** No separate "playground."
Model/tools/system-prompt/sampling are just **overrides we send in the request** — opt-in
agents honor them; dumb agents ignore them and still work.

**Request** (OpenAI Responses-ish, what loupe already speaks):

```jsonc
POST <target endpoint>
{
  "input": <example.input>,
  // ride the SAME key loupe already groups traces on — no bespoke loupe_* namespace.
  // we mint one id per (run, example) call; the agent echoes it onto its spans.
  "conversation_id": "<gen_ai.conversation.id / ag_ui.thread_id>"
}
```

**Response** — Responses-compatible; loupe reads the output text into `RunItem.output`.

**Trace linkage — reuse existing session grouping, don't invent metadata.** loupe already
groups traces by `gen_ai.conversation.id` / `ag_ui.thread_id`. For a run we mint a unique id
per (run, example) call and pass it as that conversation/thread id; **the agent sets it on its
spans on their side** (same as any normal request). loupe then links the resulting trace to
the run-item by the id it *already* groups on — `RunItem.traceId`. We still need *an* id (to
map each answer to its trace), but it's the existing mechanism, not a new `loupe_*` field.

**This cut: dumb target only.** POST `{input}`, agent answers. The agent's model/tools/
prompt live inside the agent; loupe just records what comes back.

**Deferred — agent-behavior overrides (model/tools/system-prompt/sampling).** Sent as extra
request fields that opt-in agents honor (lets you A/B a model or prompt from loupe). **UI is
mocked/disabled now** (a "Model ▾ / Advanced" control rendered but inert); wired later.

## UI (shadcn, close to the Phoenix/Arize feel)

### `/datasets` — overview
Table: **Name · # examples · # runs · last run · updated · tags**, search, "New dataset".

### `/datasets/$id` — detail, **two tabs on one page**
The questions and the runs are the same dataset seen two ways (this matches Arize: an
Examples tab to edit, a comparison grid to run). Shared header: editable name,
**version selector** (timestamped, one version at a time), tags, `↧ CSV`.

**Tab 1 — Examples (edit your questions).**
- Table: `☐ · INPUT · EXPECTED · METADATA · last run`. The left block (input/expected/
  metadata) is **editable**; `last run` is a read-only peek.
- `+ Example` adds a row inline; clicking a row opens a **drawer** (input / expected /
  metadata / **Source backlink** to the trace it was captured from). Filling in `expected`
  is what turns a regression row into a golden row.
- Select rows → **Delete**. `↧ CSV` exports.

**Tab 2 — Runs (run + compare).**
- **"Call my agent" bar** on top — **endpoint URL + `▶ Run on all`**. That's the whole live
  config this cut. A `Model ▾ / Advanced` control + a `Judge ▾` sit here too but are
  **mocked/disabled** (UI only, deferred — see overrides above).
- **Grid:** rows = examples (input + expected, read-only here), columns = each saved run.
  Each `▶ Run all` produces a **new column auto-labeled by time**, so columns self-document.
- per-cell `▶` re-runs just that example; **⚠** flags an answer that changed vs the prior
  run; a per-run **score summary** + per-cell badges render as **mocked placeholders**.
- click any cell → result drawer.

### Result drawer (one run-item)
Input · expected · answer · model/latency/tokens/status · **trace link** · score (mocked).
Prev/next arrows to walk the run.

### Single run page (`/datasets/$id/runs/$runId`)
Same data, one run expanded top-to-bottom (shareable link): INPUT · EXPECTED · ANSWER ·
TRACE · score (mocked).

## Adding existing things to a dataset
Three entry points, all landing the same Example shape:
- **From a trace/session (main path):** on the inspect/sessions table, select rows →
  **Add to dataset** → pick existing or new dataset → **map** which span attribute becomes
  `input` vs `expected` (default `attributes.input.value` / `attributes.output.value`), or
  leave expected blank to fill later. Stamps `sourceTraceId`/`sourceSpanId`.
- **CSV/JSON upload:** in `+ New dataset` / `⋯ → Import`, drop a file, map columns.
- **Manual:** `+ Example`, type it.
- *(Later: auto-add rules — spans matching a filter/eval-label stream in automatically.)*

## Scope

**Real now:** dataset + example CRUD, capture-from-trace, versioning, REST run (dumb
target — `{input}` only) with trace linkage, run grid + cross-run compare, run detail.

**Mocked/placeholder now:** agent-behavior overrides (Model ▾ / Advanced control) and
anything scoring/eval/judge — columns, badges, "judge" config field. Wired visually, not
functionally.

**Not now:** synthetic generation, dataset splits (train/val/test), bulk eval.

## Decisions (settled)
- **Storage:** new tables in `src/db/schema.ts` — `dataset`, `dataset_example`,
  `dataset_run`, `dataset_run_item`.
- **Endpoint config:** **global default + per-dataset override.** One app-wide default agent
  endpoint; a dataset may override it.
- **Run execution:** **synchronous server fn now**, swap to background-job + polling later.
  ⚠️ TODO when the sync path is built: leave a clear marker to migrate to background +
  polling before large datasets / slow agents are real.
- **Versioning:** **auto per-mutation** (like Arize/Langfuse) — every add/edit/delete bumps
  a timestamped version; a run pins to the version it ran against.

## Build order
1. **UI-only first (mock data, no backend)** — all pages/components wired to in-memory
   fixtures so the look & flow can be approved. ← current step.
2. Then schema + server fns + real REST run, replacing fixtures.
