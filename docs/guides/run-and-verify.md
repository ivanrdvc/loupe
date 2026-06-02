---
title: Run a loupe feature against the live app and verify in Brave
type: guide
summary: Boot loupe locally, exercise a feature against a real agent / the MAF sandbox,
         and verify it end-to-end in the browser.
status: current
owner: "@ivan"
audience: loupe-devs
last-reviewed: 2026-05-31
tags: [sandbox, testing, e2e, brave]
---

# Run a loupe feature against the live app and verify in Brave

You changed a feature and want to confirm it works in the real app — not just unit tests.
The harness is always the same: **boot loupe → start a target agent → drive the UI → verify
in the browser (+ `dev.db`) → clean up**.

## 1. Start the app

```bash
pnpm db:migrate     # apply migrations (needed on a fresh checkout / after schema changes)
pnpm dev            # http://localhost:3000
```

Env vars are read at process start — if you change `.env`, restart `pnpm dev`.

## 2. Start a target agent (to produce traces)

The MAF sandbox is a real MAF agent backed by OpenAI on `localhost:4280`, exporting OTel
traces. It auto-starts on first fire:

```bash
.claude/skills/maf-sandbox/fire.py "hello"     # fire a few for traces
```

It's entity-routed, so it 400s without `metadata.entity_id`. If a feature routes by entity,
discover the (dynamic) id and set it in `.env`, then restart `pnpm dev`:

```bash
curl -s http://localhost:4280/v1/entities | jq -r '.entities[]|select(.name=="sandbox-agent").id'
```

Or point at your own deployed agent's Responses URL directly.

## 3. Drive the UI

Exercise the feature in the running app. To drive it programmatically (e.g. an agent
verifying a change), use the chrome-devtools MCP — Brave is Chromium, so the same
snapshot/click flow applies.

## 4. Verify

Telemetry (traces/spans) lives in OpenObserve / App Insights, not `dev.db`. App state
(scores, datasets, notes, prompts, inventory…) is in `dev.db` — query it to confirm writes:

```bash
sqlite3 -header dev.db "select * from <table> order by id desc limit 5;"
```

## 5. Clean up

A stray dev server, sandbox, or driven Brave tab quietly holds ports/state and confuses the
next run. Tear it all down:

```bash
kill $(lsof -ti:3000) 2>/dev/null    # app
kill $(lsof -ti:4280) 2>/dev/null    # MAF sandbox (or: pkill -f maf.py; log at /tmp/maf-sandbox.log)
for p in 3000 4280; do lsof -ti:$p >/dev/null 2>&1 && echo "$p STILL UP" || echo "$p free"; done
```

Close any tabs the automation opened (via the chrome-devtools MCP, `close_page`). If you
seeded test rows into `dev.db`, prune them — or back up first (`cp dev.db dev.db.bak`) and
restore after.
