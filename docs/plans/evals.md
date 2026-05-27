# Evals — Feature Plan

Status: draft. Ingestion shape is roughly settled (push + OTel + drop + manual). The questions below need answers before we lock the data model and UI.

---

## Open questions (decide before building)

### 1. Presentation & organization

How does a user think about "evals" inside loupe? Pick the mental model first; the schema falls out of it.

- **Flat list of runs, tagged?** Every ingested `ScenarioRunResult` is just another timestamped row; we filter by tag (`name=qa-bot-regression`, `env=ci`, `git_sha=…`). Cheapest. No "definition" concept at all — the eval *is* the set of runs that share a name.
- **Definition + runs (two levels)?** A named eval definition (durable card) has a stream of runs underneath. Matches how Foundry / MEAI users think. Slightly more schema, much better landing page.
- **Suites (three levels)?** Suite → definition → run. Probably premature; revisit when a customer asks.

Sub-questions:
- Do eval definitions live per-project, or are they global with a project filter?
- Are definitions explicit (user creates one) or implicit (first ingest with a new `name` auto-creates)? Implicit is friendlier; explicit is tidier.
- Where do evals appear in the nav — sibling to `/runs`, or nested under a run? Probably sibling; an eval can cover many runs.

### 2. Storage — can we be minimalist (or skip our own store entirely)?

Three options, increasing in commitment:

- **A. No DB.** Eval results live as OTel logs in OpenObserve. Every list / detail page is a query. Pros: zero new tables, free trace linkage, single source of truth. Cons: comparison/aggregation across many runs is slow and awkward in OpenObserve; pass-rate-over-time charts need expensive scans; no good place to store user-authored metadata (notes, baselines).
- **B. Thin index.** Tiny relational table (`eval_runs`: id, definition_name, external_id, started_at, summary_json, trace_id). Detail rows stay in OpenObserve and are fetched on demand. Pros: fast list/compare on summary metrics; detail stays "free." Cons: two stores to keep in sync; what happens when OpenObserve retention drops old detail?
- **C. Full mirror.** Both `eval_runs` and `eval_run_results` in our DB. Pros: every query is fast, retention is ours to set, comparison is trivial. Cons: duplicate storage; we now own a real data pipeline.

Decision driver: **how often do users compare across >10 runs?** Rare → A. Common → B or C. The OpenObserve query budget per page load is the real constraint.

Worth a 1-day spike: build option A end-to-end with synthetic data; see if listing 200 runs and a 30-day pass-rate chart is acceptable.

### 3. History & comparison

The comparison primitives we need to support (pick which are v1):

- **Run vs run on the same definition** — "did the latest CI run regress?" Requires stable identity for *test cases* across runs (i.e., `scenario_name` + `iteration` is the key).
- **Pass rate over time** — line chart of % passed for a definition over the last N runs / days.
- **Per-row diff** — given two runs, show which cases flipped pass↔fail and which metric values moved.
- **Baseline / "blessed" run** — pin one run as the baseline; all later runs are diffed against it.
- **Bisect by `git_sha`** — only useful if the user tags runs with their commit SHA on ingest. Cheap to support if we just store the tag.
- **Cross-definition comparison** — same dataset, two models. Probably v2.

Stable case identity is the single most important schema decision: if `(definition_name, scenario_name, iteration)` isn't stable across runs, none of the above work. Ingest should refuse runs that change this shape silently, or surface the drift loudly.

Retention: if we go option A or B above, OpenObserve retention dictates how far back comparison reaches. Need to decide: do we keep summaries forever in our DB even if detail rolls off?

### 4. Triggering existing evals against captured sessions

Assume sessions from other users are already visible to us (per `docs/plans/sessions.md`). Can a user pick a saved eval definition and "run it" against an incoming session — without breaking the ingest-only stance?

Tentative compromise: **we orchestrate, we don't evaluate.**

1. User clicks "Run eval X against session Y" in the UI.
2. loupe POSTs the session messages + eval criteria to a **user-registered evaluator endpoint** (an HTTP webhook the user owns — could be their CI, a Lambda, an LLM-judge service).
3. The evaluator runs wherever the user wants and POSTs results back to the existing `/api/evals/ingest`, tagged with the source session id.
4. The result row links to both the eval definition and the originating session.

What changes vs. today:
- **Eval definition** gains an optional `evaluator_endpoint_url` (or webhook ref). Without it, the definition remains ingest-only as today — a card that displays results, not one that fires them.
- **`eval_runs`** gains an optional `triggered_against_session_id` (and/or `triggered_against_run_id` for finer granularity).
- **Non-goal still holds**: we don't host evaluator code. The endpoint is the user's; we just hand off and wait.

Sub-questions:
- Input granularity — whole session, or one specific run inside it? Probably let the eval definition declare which it wants.
- Async by default — evaluators may take minutes (LLM judge). UI shows a `pending` run row; result lands when the evaluator POSTs back.
- Auto-trigger on new matching session, or manual only? Manual first. Auto-eval (e.g., "score every new session matching filter F with eval E") is a v2 once the manual flow works.
- Authorization — when the registered evaluator is external, we sign outbound requests so the evaluator can verify the source.

---

## Feature overview

Users run evals on their agents (MEAI in .NET, `agent_framework` in Python, or custom). loupe collects the results and shows them on an eval page with history and trace linkage. No outbound calls to Microsoft, no Foundry dependency.

## Ingestion — four paths, one landing zone

All paths normalize to the same internal shape, so the UI doesn't care which path produced a row.

### Path 1 — Direct push (default, easiest)

```
POST /api/evals/ingest
Authorization: Bearer <project_api_key>
Body: ScenarioRunResult JSON (single or batched)
```

Idempotent on `(project_id, definition_name, run.external_id)`. Callers: a `loupe-upload` CLI, a GitHub Action, or a tiny `@loupe/evals` SDK they import in their test setup.

### Path 2 — OTel piggyback (for users who already ship OTel to OpenObserve)

When this lands, the `eval.*` attrs below should be declared in [`../explanation/02-spec.md`](../explanation/02-spec.md) alongside the existing `gen_ai.*` and `task.*` sets — loupe's convention spec is the canonical home for "what attrs loupe reads", and eval attrs are a natural spec extension. Cross-link both directions when the spec gets a new section.

Ship a small MEAI `IEvaluationResultStore` / Python equivalent that emits each result as an **OTel log record** with a known attribute schema:

```
eval.run.external_id   = "<ci run id>"
eval.definition.name   = "qa-bot-regression"
eval.scenario          = "..."
eval.iteration         = "..."
eval.metric.name       = "Relevance"
eval.metric.value      = 0.82
eval.metric.passed     = true
eval.metric.reason     = "..."
```

The log inherits the parent agent span's trace context → trace linkage is free. loupe queries OpenObserve for `event.name = "loupe.eval"` on a cron (or lazily) and materializes into the same tables as Path 1.

### Path 3 — Object-storage drop (no OTel, no outbound HTTP from CI)

User writes results to a blob container they own (MEAI's `AzureStorageReportingConfiguration` does this natively). They grant us read-only creds. Worker lists new objects every minute, ingests, marks done.

### Path 4 — Manual upload in UI

Drag-drop a folder or zip of `ScenarioRunResult` JSONs onto the eval page. Reuses the ingest validator. For air-gapped / one-off use, and as the "try it without writing code" path.

## Data model (placeholder — depends on storage decision above)

If we land on option B (thin index):

```
eval_definitions (id, project_id, name, created_at, baseline_run_id?)
eval_runs        (id, definition_id, external_id, status,
                  started_at, ended_at, summary jsonb,
                  git_sha?, env?, trace_id?)
eval_run_results — kept in OpenObserve; fetched on detail page
```

Indexes: `(definition_id, started_at desc)` for history; `(project_id, name)` for upsert.

## UI

- `/evals` — list of definitions, last-run badge, pass-rate sparkline.
- `/evals/$id` — definition header + run history table + pass-rate chart + "compare to baseline" toggle.
- `/evals/$id/runs/$rid` — per-case table, filter to failed, click row → trace in OpenObserve.
- `/evals/$id/compare?a=…&b=…` — per-case diff between two runs.
- On existing `/runs/$runId`: side panel "Evaluated by: …" linking out.

## Build order

1. Decide the three open questions above (½ day spike on storage option A).
2. Ingest endpoint + minimal tables + idempotency.
3. `/evals` list and `/evals/$id` history page on synthetic data.
4. Manual upload (Path 4) so we can dogfood without writing the CLI.
5. CLI / GH Action wrapper (Path 1).
6. Per-run detail page with trace linkage.
7. Comparison view + baseline pinning.
8. OTel piggyback shim (Path 2) — only after a real .NET user appears.
9. Object-storage drop (Path 3) — only on request.

## Non-goals (v1)

- Authoring eval definitions inside loupe (we receive, we don't define).
- Running evals ourselves / hosting evaluator LLMs.
- Foundry integration (skipped per current direction).
- Real-time streaming of a long-running eval. Batch on completion is fine.
