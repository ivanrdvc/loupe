---
title: Run datasets against the live app and verify in Brave
type: guide
summary: Boot loupe locally, point a dataset at a real agent (or the MAF sandbox), fire a
         run from the UI, and verify the result end-to-end in the Brave browser.
status: draft
owner: "@ivan"
audience: loupe-devs
last-reviewed: 2026-05-30
tags: [datasets, evaluation, sandbox, testing]
---

# Run datasets against the live app and verify in Brave

## When to use this guide

You changed something in the datasets feature (or the runner) and want to confirm it works
in the real app — not just unit tests. This covers booting loupe, pointing a dataset at a
live agent endpoint, firing a run, and eyeballing the result in Brave.

## Prerequisites

- `DATABASE_URL` set (`.env.local` → `dev.db`); migrations applied (`pnpm db:migrate`).
- A target agent speaking the OpenAI **Responses** API, or the MAF sandbox (below).
- Brave (or any Chromium browser) for manual verification.

## 1. Start the live app

```bash
pnpm dev            # http://localhost:3000
```

Env vars are read at process start — if you change `.env.local`, restart `pnpm dev`.

## 2. Start a target agent

**Option A — MAF sandbox (real LLM, local).** A real MAF agent backed by OpenAI on
`localhost:4280`, also exporting OTel traces.

```bash
.claude/skills/maf-sandbox/fire.py "hello"     # auto-starts the sandbox
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

How the run picks an endpoint: per-dataset override (the "Call my agent" box, persisted on
blur) → else `DATASET_RUN_ENDPOINT` → `PROMPT_LIVE_ENDPOINT` → built-in default.

## 3. Fire a run

In the app: `/datasets` → pick a dataset → **Runs** tab → set **Call my agent**
(`http://localhost:4280/v1/responses` for the sandbox) → **Run on all**. A new run column
appears, auto-labeled by time. The per-row ▶ on `/datasets` runs the whole dataset on the
default endpoint.

No datasets yet? Create one via **New dataset** + add examples, or seed `dev.db` directly
with `better-sqlite3` for a batch.

## 4. Brave testing

Open `http://localhost:3000/datasets` in Brave and walk the path:

1. Open a dataset, **Runs** tab, confirm the endpoint box is pre-filled, click **Run on all**.
2. The run is **synchronous** — the button shows "Running…" for a few seconds per example.
   Wait for the "Run complete" toast.
3. Each cell should show the agent's answer + latency; a failure shows `⚠ run failed`.
4. Click a cell → result drawer (input · expected · answer · latency · tokens · trace · score).
5. Run again to get a second column; tap a run pill to **compare**; `⚠` marks an answer that
   changed vs the prior run.
6. DevTools → Network: the **Run on all** POST is the server fn; its response carries the new
   `runId`. The agent calls happen server-side, so you'll see them in the sandbox log, not here.

Driving it programmatically (e.g. an agent verifying a change) works the same way via the
chrome-devtools MCP — Brave is Chromium, so the same snapshot/click flow applies.

## Verify

- Grid fills with real answers; latency and token counts are non-zero.
- `traceId` resolution is **best-effort**: with OpenObserve active (fast ingest) the trace link
  usually appears; with App Insights (minutes-long ingest) it can stay null at run time — the
  minted `conversation_id` is stored so the link can be backfilled.

## Notes

- Runs are synchronous (`TODO(datasets)` in `src/server/datasets.ts` to move to a background
  job + polling before large/slow datasets).
- Agent-behavior overrides and scoring/judges are mocked — see [plans/datasets.md](../plans/datasets.md).

## Related

- [explanation/datasets.md](../explanation/datasets.md) — the data model and trace linkage.
- [plans/datasets.md](../plans/datasets.md) — scope and settled decisions.
