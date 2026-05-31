---
title: Run a loupe feature against the live app and verify in Brave
type: guide
summary: Boot loupe locally, exercise a feature against a real agent / the MAF sandbox, and
         verify it end-to-end in the Brave browser. Datasets and evaluators are the worked
         examples; the boot / sandbox / Brave harness is the same for any feature.
status: draft
owner: "@ivan"
audience: loupe-devs
last-reviewed: 2026-05-31
tags: [datasets, evaluation, evals, judge, sandbox, testing, handover, e2e]
---

# Run a loupe feature against the live app and verify in Brave

You changed a feature and want to confirm it works in the real app — not just unit tests.
The harness is always the same: **boot loupe → start a target agent / the MAF sandbox →
drive the UI → verify in Brave (+ `dev.db`)**. Datasets and evaluators (LLM judge) are the
two worked examples below; swap in any feature's flow at step 3–5. The last section is a
**handover** for whoever continues the evaluation feature.

## Prerequisites

- `DATABASE_URL` set (`.env.local` → `dev.db`); migrations applied (`pnpm db:migrate`,
  latest `0008`).
- A target agent and a judge endpoint speaking the OpenAI **Responses** API (the MAF sandbox
  works for the agent; the judge needs its own endpoint — see §Judge endpoint).
- Brave (or any Chromium browser) for manual verification.

## 1. Start the live app

```bash
pnpm dev            # http://localhost:3000
```

Env vars are read at process start — if you change `.env.local`, restart `pnpm dev`.

## 2. Start a target agent (for datasets + to produce traces)

**Option A — MAF sandbox (real LLM, local).** A real MAF agent backed by OpenAI on
`localhost:4280`, also exporting OTel traces.

```bash
.claude/skills/maf-sandbox/fire.py "hello"     # auto-starts the sandbox; fire a few for traces
```

The sandbox is entity-routed, so it 400s without `metadata.entity_id`. Discover its
(dynamic) id and give it to the runner, then restart `pnpm dev`:

```bash
curl -s http://localhost:4280/v1/entities | jq -r '.entities[]|select(.name=="sandbox-agent").id'
# loupe/.env.local:
#   DATASET_RUN_AGENT="agent_in_memory_sandbox-agent_<hash>"
```

**Option B — your deployed agent.** Use its Responses URL directly; set `DATASET_RUN_AGENT`
only if it routes by entity id.

How the dataset run picks an endpoint: per-dataset override (the "Call my agent" box,
persisted on blur) → else `DATASET_RUN_ENDPOINT` → `PROMPT_LIVE_ENDPOINT` → built-in default.

## 3. Run a dataset

In the app: `/datasets` → pick a dataset → **Runs** tab → set **Call my agent**
(`http://localhost:4280/v1/responses` for the sandbox) → **Run on all**. A new run column
appears, auto-labeled by time. The per-row ▶ on `/datasets` runs the whole dataset on the
default endpoint.

No datasets yet? Create one via **New dataset** + add examples, or seed `dev.db` directly
with `better-sqlite3` for a batch.

## 4. Run an evaluator (LLM judge) over traces

The judge resolves its endpoint as `JUDGE_ENDPOINT` → `PROMPT_LIVE_ENDPOINT`, model
`JUDGE_MODEL` (default `gpt-4o-mini`). It calls the same `callAgent` as the dataset runner.

### Judge endpoint (the one thing to get right)

The judge expects a Responses endpoint it can POST to with **no entity routing**. Gotcha:
the MAF sandbox on `:4280` *is* a real LLM endpoint but is **entity-routed**, and the
judge's `callAgent` does not send an `entity_id` — so judge→sandbox does **not** route, and
every case lands as `error_type=http_400`. To get real verdicts, do one of:

1. **Point the judge at a non-routed endpoint.** In `.env.local` (then restart dev):
   ```
   JUDGE_ENDPOINT=<an OpenAI-compatible /v1/responses needing no entity routing>
   JUDGE_MODEL=gpt-4o-mini
   JUDGE_STRUCTURED_OUTPUT=0   # only if the endpoint 400s on the text.format json_schema
   ```
2. **Enrich the sandbox + thread an entity through the judge** (more work): add a
   `judgeEntityId` (env or on `eval_definition`) and pass it as `agentName` in the
   `callAgent` call in `runJudge` (`src/server/judge.ts`) — `callAgent` maps `agentName` →
   `metadata.entity_id`.

### Run flow

1. `/evals` → **Set up evaluator**: name, Scope (Trace), Data type (Boolean), Mode
   (Library = offline), Model, a Judge prompt (e.g. *"Did the assistant answer the question?
   1=yes, 0=no."*) → **Create evaluator**.
2. Open it (`/evals/$id`) → **Run on recent traces**. This lists recent traces, snapshots the
   final chat span of each (`spanEvalSnapshot`) into a judge case, creates an `eval_run`, then
   judges each case in the background, writing a `score` row per case.
3. The run shows under **Runs**; click `#N` → `/evals/runs/$runId` for the per-case table
   (verdict, explanation, variance, trace link).

Human scoring (no external dependency): open a trace → select a span → **Review** →
**+ New dimension** → score it. Ingest path: `POST /api/evals/ingest` with
`{"events":[{targetKind,targetId,name,value,source,evaluator,...}]}`.

## 5. Brave testing

Drive it programmatically (e.g. an agent verifying a change) via the chrome-devtools MCP —
Brave is Chromium, so the same snapshot/click flow applies.

**Datasets** (`/datasets`): open a dataset → **Runs** → confirm the endpoint box is
pre-filled → **Run on all**. The run is **synchronous** ("Running…" a few seconds per
example) — wait for "Run complete". Each cell shows answer + latency; failures show
`⚠ run failed`. Click a cell → result drawer. Run again → tap a run pill to **compare**.

**Evals** (`/evals`): create an evaluator → open it → **Run on recent traces** → wait
(see rough edge below) → confirm a run row appears, then open it for the per-case table.

## Verify

```bash
# dataset run items filled with real answers
sqlite3 -header dev.db "select id,status,latency_ms,tokens,substr(output,1,40) from dataset_run_item order by id desc limit 5;"
# eval run + judge scores
sqlite3 -header dev.db "select id,status,json_extract(summary,'\$.total') total,
  json_extract(summary,'\$.errors') errors, json_extract(summary,'\$.pass') pass from eval_run;"
sqlite3 -header dev.db "select id,target_kind,name,value,error_type from score where run_id is not null limit 8;"
```

- **Datasets:** grid fills with real answers; latency/tokens non-zero. `traceId` is
  best-effort (OpenObserve fast; App Insights backfilled later from the minted
  `conversation_id`).
- **Evals pipeline OK even with a bad judge endpoint:** an `eval_run` with `total=N`,
  `done=N`, and a `score` row per case. `error_type=http_400`/`network_error` = judge endpoint
  rejected/unreachable (fix per §Judge endpoint); the run-detail page shows a `judgeEndpointHint`.
- **Green verdicts (working endpoint):** `score.value` set, `error_type` null, run `status=done`,
  pass/fail in the summary.

## 6. Clean up (don't leave processes hanging)

After an e2e session, tear everything down — a stray dev server, sandbox, or automated Brave
tab will quietly hold ports/state and confuse the next run.

```bash
# App: stop `pnpm dev` (Ctrl-C in its terminal), or by port:
kill $(lsof -ti:3000) 2>/dev/null

# MAF sandbox (maf.py on :4280, spawned by fire.py via uv; log at /tmp/maf-sandbox.log):
kill $(lsof -ti:4280) 2>/dev/null   # or: pkill -f maf.py

# Any separate judge endpoint you started (e.g. :8080):
kill $(lsof -ti:8080) 2>/dev/null

# Confirm nothing is left listening:
for p in 3000 4280 8080; do lsof -ti:$p >/dev/null 2>&1 && echo "$p STILL UP" || echo "$p free"; done
```

**Brave:** close the tabs the automation opened (or, via the chrome-devtools MCP, `close_page`
the pages you created) — don't leave driven pages around. Leave Brave itself open if you were
using it; only the loupe tabs need closing.

**`dev.db`:** the run leaves test evaluators / runs / scores / datasets behind. Either prune
them, or restore a pre-test backup (`cp dev.db dev.db.bak` before; restore after):

```bash
# prune just the evaluation test data:
sqlite3 dev.db "delete from score; delete from eval_run; delete from eval_definition; delete from score_config;"
# datasets created for testing, if any:
sqlite3 dev.db "delete from dataset_run_item; delete from dataset_run; delete from dataset_example; delete from dataset;"
```

Telemetry (traces/spans) is **not** in `dev.db` — it lives in OpenObserve / App Insights, so
there's nothing to clean there.

---

# Handover — evaluation feature (`feat/evaluation-v2`)

Two commits, **local only — nothing pushed**, off clean `main` (`origin/main`):

- **C1 `feat(evals): score primitive`** — `score`/`score_config` tables (drizzle `0008`),
  `src/lib/evaluation.ts`, `src/server/scores.ts`, `POST /api/evals/ingest`, inspector
  **Review sheet** on a span. Verified e2e (human score persists; ingest persists).
- **C2 `feat(evals): judge runner + /evals hub`** — `src/server/judge.ts` (rewritten on
  `callAgent`), `src/server/evals.ts` (evaluator/experiment CRUD, `runEval`,
  `runEvalOnTraces`/`runEvalOnRecentTraces`, `compareRuns`), the three `/evals` routes, nav
  un-gated. Verified e2e (full run pipeline; verdicts blocked only by the judge endpoint).

Renames vs the source branch: eval mode `library`→`offline`; UI terms Evaluator/Experiment.

## Known rough edges

- **`Run on recent traces` is synchronous up front.** `runEvalOnRecentTraces` awaits
  `casesFromTraces` (N sequential `getTrace` calls) before returning, so the button sits on
  "Starting…" ~10–30s for 10 traces. Move case-building into the background job.
- **Evaluator version not pinned onto scores yet** (recorded per run as
  `eval_run.definitionVersion`; online scores will want a `score.evaluatorVersion` column).
- **`score-badge.tsx` / `queries.ts`** were intentionally not ported (orphaned until the
  list-level aggregate badge is wired); re-port from commit `2c391b2` then.

## Remaining work (not started)

- **C3 — datasets ↔ judge.** Un-mock the six seams in `src/routes/datasets/$datasetId.tsx`
  (disabled `Judge ▾` ~line 443, `passRate`, `OutputCell` badge, result-drawer Score). After
  the dataset runner fills `dataset_run_item.output`, judge the outputs and write real
  `pass`/`passRate`. `score.datasetRunItemId` already links there.
- **C4 — online executor.** A discovery/cron hook sampling incoming traces matching an
  evaluator's `liveFilter`, calling the same runner. Schema + the `/evals` "Running" tab
  already assume it; only the executor is missing (new code, not a port).
- **List-level score badges + triage filter** on traces/sessions.

## Related

- [explanation/datasets.md](../explanation/datasets.md) — datasets data model and trace linkage.
- [plans/datasets.md](../plans/datasets.md) — datasets scope and decisions.
