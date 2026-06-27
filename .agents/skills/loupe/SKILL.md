---
name: loupe
description: Debug your agent/LLM app's runs through loupe — the observability backend your app emits OTel telemetry to. Use when the user pastes a loupe link (`<loupe-host>/traces/<id>` or `/sessions/<id>`), says `/loupe`, or asks why their last agent run failed / was slow / cost so much / what tools it called / what the model saw. loupe exposes a local read-only HTTP API of classified spans, reconstructed conversation, and summed cost/token aggregates; this skill is the map to query it with plain curl. Triggers on "why did my run fail", "what did my agent do", "explain this trace", "debug this session", "which tool errored", pasted loupe trace/session URLs or bare trace ids alongside a loupe link.
---

# loupe — debug a run via the HTTP API

loupe is the observability backend your app sends OpenTelemetry to. It does the work raw OTel doesn't: classifies spans, reconstructs the conversation, and sums cost/tokens. This skill queries that processed data over a local read-only JSON API so **you** can reason about a run — there's no fixed "answer," you compose the primitives and narrate.

## Resolve the base URL (config, not a constant)

loupe runs *somewhere else* relative to this app. In order:

1. `LOUPE_BASE_URL` env var, if set.
2. The origin of a pasted link — `https://host:port/traces/<id>` → base `https://host:port`.
3. Default `http://localhost:3000`.

Never hardcode the port. Most devs run loupe locally beside their app (same-machine, no auth). A shared/hosted loupe needs auth — out of this skill's scope.

## The compose loop (search → drill → zoom)

```bash
BASE="${LOUPE_BASE_URL:-http://localhost:3000}"

# 1. Research — one flexible primitive. Combine any filters; read `facets` to
#    learn the agents/models/categories present, then narrow.
curl -s "$BASE/api/search?status=error&since=7d&sort=cost"
curl -s "$BASE/api/search?agent=checkout&min_cost=0.05"
curl -s "$BASE/api/search?entity=spans&model=gpt-5"
# filters: q status agent model session user category min_cost min_tokens min_duration_ms · sort=recent|cost|tokens|duration

# 2. Drill into a hit — classified span tree + aggregates, or the conversation
curl -s "$BASE/api/traces/<id>"
curl -s "$BASE/api/traces/<id>/conversation"

# 3. Zoom into one span (full untruncated I/O)
curl -s "$BASE/api/traces/<id>/spans/<spanId>"

# Truncation hiding the answer? Lift the caps.
curl -s "$BASE/api/traces/<id>?detail=full"            # or detail=raw / detail=dump
```

`q` searches metadata (agent/model/operation/names), not message content — for that, drill in and read the span I/O with `?detail=full`.

For a fast prose summary instead of raw data: `GET /api/traces/<id>/brief` (markdown). Sessions: `/api/sessions/<id>` and `/api/sessions/<id>/brief`.

## What to read first

- **"why did it fail"** → `/conversation` (or `/brief`); errors are always shown in full. Then zoom the failing span.
- **"why so expensive / slow"** → the `aggregates` block on `/api/traces/<id>` (tokens, cost, duration), then the slowest spans in the tree.
- **"what did the model actually see"** → the `input`/`output` on chat spans; add `?detail=full` if truncated.

Full endpoint + param reference: [`references/endpoints.md`](references/endpoints.md).

## Don't

- Don't paste raw JSON back to the user — read it yourself, report what's load-bearing.
- Don't default to `?detail=full` on big traces — start truncated, lift caps only when an answer is hidden. Use `?detail=dump` for genuinely huge payloads (writes to a file, returns the path).
- It's read-only — no writes, annotations, or re-runs through this API.
