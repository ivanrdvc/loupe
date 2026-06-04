---
title: Evaluation
type: explanation
summary: One `score` primitive written by humans, LLM judges, and code; evaluators
         (eval_definition) run as offline experiments (eval_run) or online monitors,
         plus dataset-output grading. Why it's one table and how the in-app judge,
         datasets↔judge, and online executor all reuse the same scoring path.
status: draft
owner: "@ivan"
audience: loupe-devs
last-reviewed: 2026-05-31
tags: [evaluation, evals, judge, scores, datasets, traces]
---

# Evaluation

loupe scores agent behavior — "was this answer correct?", "did it pick the right
tool?" — from three kinds of writer (a human in the inspector, an LLM judge, a
code assertion) against the same data model. This doc is the mental model: the
one primitive everything writes, the evaluator/experiment objects on top, and the
four ways a verdict gets produced (human, offline judge run, dataset grading,
online monitor). The worked end-to-end flow lives in
[guides/run-and-verify.md](../guides/run-and-verify.md); this is the "why".

## The shape of the problem

A score can come from a person, a model, or a rule; can target a span, a trace,
or a session; and can be a number, a category, a boolean, or free text. We didn't
want a separate "human annotations" store, an "LLM evals" store, and a "CI
assertions" store that never reconcile — disagreement between a human and a judge
on the *same* dimension is the signal we most want to surface. So there is **one
table**, and `source` disambiguates the writer.

The judge runs **in-app**, not as an external eval service: it calls the model
through the **Vercel AI SDK** with a BYO key from env (`OPENAI_API_KEY` /
`ANTHROPIC_API_KEY`) and reads only normalized `Span` fields, so it grades any
emitter identically. Provider is inferred from the model id (`claude*` → Anthropic,
else OpenAI).

## How it works

### The score primitive

`score` (`src/db/schema.ts`) is the unified row: `targetKind`/`targetId`,
`dataType`, a `value` (numeric/boolean) **or** `label` (categorical/text),
`explanation`, `source` (`human` | `llm` | `code`), and an `errorType` for a
verdict that failed to produce a usable answer. Links: `runId` (an offline run),
`definitionId` (the online evaluator), `datasetRunItemId` (a graded dataset
output), `parentTraceId`/`parentSessionId` (denormalized for list rollups).

The key invariant is the partial unique index `score_live_unique` on
`(targetKind, targetId, name, evaluator) WHERE run_id IS NULL`:

- **Run-less scores upsert.** A human re-scoring replaces the one current row for
  that (target, dimension, author). The online judge is idempotent instead:
  already-scored `(definition, trace)` pairs are skipped (`onConflictDoNothing`), so
  a tick never re-judges or overwrites.
- **Run scores are append-only.** Offline-run verdicts (`run_id` set) are exempt
  from the index, so a re-run never clobbers a prior run's history.

`score_config` is the **dimension registry** — the source of truth for polarity
and scale (categorical pass/fail label sets, numeric min/max + direction). Without
it a dimension is *unclassified*: shown, but excluded from pass-rate. Pure helpers
(`scoreIsBad`, `scorePassFail`, `numericFraction`, `summarizeScores`) live in
`src/lib/eval/evaluation.ts` so every surface — list badges, run summaries, the rollup,
compare — classifies a verdict the same way.

### Evaluators and experiments

- **Evaluator** = `eval_definition` (`src/server/evals.ts`): a managed judge —
  name, `scope`, `dataType`, judge prompt, model, `mode` (`offline` | `online`),
  `status`, and a `version` that bumps when the prompt or model changes.
- **Experiment** = `eval_run`: one offline execution over a fixed target set, with
  a `summary` (pass/fail/errors/cost) filled in incrementally as it runs.

### The in-app LLM judge

`src/server/judge.ts` is the scoring engine. `runJudge` builds a system prompt
from the rubric + a data-type instruction, sends the target's fields (and an
optional `expected`) as the user message, and asks for a JSON verdict —
constrained by a Responses `text.format` json_schema (`buildVerdictSchema`).
`parseVerdict` recovers the verdict even from prose or a fenced block, so a
provider that ignores structured output still works. A 200 with no usable verdict
is flagged `errorType: 'parse_error'` rather than counted as a pass.
`runJudgeSamples` repeats N times at a non-zero temperature and aggregates
(mean + variance for numeric/boolean, modal label for categorical) for calibration.

**Provider resolution** (`resolveJudgeDefaults`): model `JUDGE_MODEL` (default
`gpt-4o-mini`) picks the provider (`claude*` → Anthropic, else OpenAI at
`api.openai.com`) and the matching key (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`)
authenticates it. `runJudge` uses `generateObject` with the verdict JSON schema for
structured output (falling back to `generateText` + `parseVerdict` when
`JUDGE_STRUCTURED_OUTPUT=0` or a model returns prose). A missing key for the chosen
provider surfaces per-case as `config_error`; the run-detail page shows a
`judgeErrorHint`.

### The four producers

1. **Human** (Path A) — the inspector Review sheet and the bulk review queue
   (`review-mode.tsx`) write a `source='human'` run-less score via `upsertHumanScore`
   (`src/server/scores.ts`). Both also expose golden capture → dataset example.
2. **Offline run** (Path B) — a caller builds cases with `casesFromTraces`
   (`src/server/eval-jobs.ts`) — one case per chat span for `scope=span`, else the
   trace's final chat span — and calls `runEval`, which creates an `eval_run`,
   returns immediately as `running`, then in the background judges each case and
   writes one append-only score per case (`executeEvalRun`).
3. **Dataset grading** (datasets↔judge) — after a dataset run fills
   `dataset_run_item.output`, `judgeDatasetRun` (`src/server/dataset-judge.ts`)
   grades each output against its example's `expected` and writes one run-less
   score per item, linked by `datasetRunItemId`. `getDatasetDetail` reads those
   back into per-item `pass` and per-run `passRate`. To grade *behavior* (not just
   text) — a `tool_selection` judge, or an `expected` like `{"tool":"multiply"}` —
   the judge also gets a `toolCalls` field: `runDataset` snapshots the trace's tool
   calls into `dataset_run_item.tool_calls_json` at run time (so grading survives
   provider trace expiry), and the judge recovers them from the trace
   (`toolCallsFromTrace`) only for rows captured before snapshots existed.
4. **Online monitor** (the executor) — `runOnlineEvals`
   (`src/server/online-evals.ts`) samples recent traces, matches each against an
   active online evaluator's `liveFilter`
   (`src/server/online-eval-filter.ts`), judges the new ones, and writes run-less
   scores carrying `definitionId`. The live-unique index makes it idempotent:
   already-scored `(definition, trace)` pairs are skipped, so a tick never
   re-judges or re-pays. It is wired into the **home loader**
   (`src/routes/-home-data.ts`) — the same place `runDetection` runs — which is
   loupe's "cron"; it's a no-op unless an active online evaluator exists.

External emitters can also write scores directly: `POST /api/evals/ingest`
(`src/routes/api/evals/ingest.ts`) maps `gen_ai.evaluation.*`-style events to
score rows (Path C).

The rollup (`getScoreRollup`) counts only **run-less, non-dataset** scores — an
offline experiment or a dataset grading must not inflate the live production
distribution.

### Client/server boundary

A subtle constraint shapes the file layout: a module a **client route** imports
must export only server functions (`createServerFn`) + types. A plain function
export stops the TanStack Start compiler from replacing the module with client
stubs, so the full module loads in the browser and its top-level `import { db }`
(→ `better-sqlite3`) crashes the page. That's why `casesFromTraces` and
`recoverStuckEvalRuns` live in `src/server/eval-jobs.ts` (never client-imported)
and `evals.ts` stays fully strippable.

## Trade-offs and non-goals

- **Code evaluators aren't built.** `source='code'` exists in the schema and a
  run refuses non-LLM evaluators rather than mislabel LLM verdicts.
- **The online executor is home-loader-driven, not a real scheduler.** Throttled
  by the inbox cache TTL, sampled, and capped per tick (a home load can't fan out
  into hundreds of judge calls). A crashed background run is reaped by
  `recoverStuckEvalRuns`. A standalone scheduler is deferred.
- **Dataset trace linkage is best-effort.** A graded item targets its trace id
  when resolved, else a synthetic `item:<id>` — so grading never blocks on
  telemetry ingestion latency.
- **One table costs denormalization.** `parentTraceId`/`parentSessionId` are
  copied onto every score so list badges can bucket without a join.

## Not yet built

- **Code evaluators** (`source='code'`) still aren't implemented — a run refuses
  non-LLM evaluators.
- **Per-evaluator model keys aren't stored** — keys come from env (the AI SDK's
  default), not a per-evaluator secret. A multi-tenant key store is deferred.
- **Dataset-judge scores carry no `evaluatorVersion` only by default** — the ad-hoc
  default-correctness judge has no `eval_definition`, so its version stays null. When
  a dataset run is graded against a chosen evaluator, the scores pin that evaluator's
  `definitionId` and `evaluatorVersion` (like offline-run + online scores).

## Related

- [Datasets](datasets.md) — the dataset model + trace linkage grading reuses.
- [guides/run-and-verify.md](../guides/run-and-verify.md) — boot, run, and verify
  the judge end-to-end.
