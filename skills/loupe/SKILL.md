---
name: loupe
description: Debug your agent/LLM app's runs through loupe — the observability backend your app emits OTel telemetry to. Use when the user pastes a loupe link (`<loupe-host>/traces/<id>` or `/sessions/<id>`), says `/loupe`, or asks why their last agent run failed / was slow / cost so much / what tools it called / what the model saw. loupe exposes a local read-only HTTP API of classified spans, reconstructed conversation, and summed cost/token aggregates; this skill is the judgment for querying it with plain curl. Triggers on "why did my run fail", "what did my agent do", "explain this trace", "debug this session", "which tool errored", pasted loupe trace/session URLs or bare trace ids alongside a loupe link.
---

# loupe — debug a run via the HTTP API

loupe is the observability backend your app sends OpenTelemetry to. It does the work raw OTel doesn't: classifies spans, reconstructs the conversation, and sums cost/tokens. You query that processed data over a local read-only JSON API and reason about the run yourself — there's no canned "answer," you compose primitives and narrate what you find.

## Start at the live catalog, not this file

The API self-documents. `GET $BASE/api` returns the current endpoint list, the compose loop, every `/api/search` filter, and the truncation/`detail` rules. It's the source of truth and it can't drift; this skill deliberately does **not** restate it. Curl it once at the start of a session and let it tell you what's available:

```bash
curl -s "$BASE/api"
```

This skill covers what that catalog can't tell you: how to reach it, what to read first, and the one trap it doesn't warn about (content search).

## Resolve the base URL first (you have to know to hit it)

loupe runs *somewhere else* relative to the app you're debugging. Resolve `$BASE` in this order:

1. `LOUPE_BASE_URL` env var, if set.
2. The origin of a pasted link — `https://host:port/traces/<id>` → `https://host:port`.
3. Default `http://localhost:3000`.

```bash
BASE="${LOUPE_BASE_URL:-http://localhost:3000}"
```

Never hardcode the port. Most devs run loupe locally beside their app (same machine, no auth). A shared/hosted loupe needs auth and is out of scope here. A bare `localhost:3000/traces/<id>` link *is* a loupe trace — that's your cue to curl, not to ask what loupe is.

## What to read first, by question

The compose loop (search → trace → span, lift `detail` when truncated) is in `GET /api`. What it doesn't tell you is where to *start* for a given question:

- **"why did it fail"** → `/api/traces/<id>/conversation` (or `/brief` for prose). Errors are never truncated, so the failure text is already there; then zoom the failing span with `/spans/<spanId>` for full I/O and stack.
- **"why so slow / so expensive"** → the `aggregates` on `/api/traces/<id>` (cost, tokens, duration), then read the tree for the slowest or priciest spans. For a whole run of work, start at `/api/search?sort=cost` or `sort=duration` to find the offender before drilling.
- **"what did the model actually see"** → the `input`/`output` on chat spans. These truncate at ~400 chars by default; add `?detail=full` only on the one span you care about, not the whole trace.
- **"explain this run / session"** → `/brief` is the fast prose door; fall back to `/conversation` or the span tree when the brief glosses over the part you need.

## Finding a run by something said in it (there is no content search)

This is the one trap the catalog won't save you from. `GET /api` lists a `q` filter — but `q` matches **metadata only** (agent, model, operation, service, session, names), *never* the words inside a message or tool call. So `?q=<a phrase the user typed>` returns zero hits even when the run plainly exists. An empty result means "not in the metadata," not "no such run."

Two ways this goes wrong, both slow: trusting the empty `q` result and giving up, or fanning out over the whole window one trace at a time. A wide window is 50–300 traces, and grepping every conversation is minutes of wall-clock — that brute force is the failure mode, **not** the fallback. Instead, **start as narrow as the question allows and widen in steps, stopping at the first hit:**

1. **Open the tightest plausible window first.** `since` is the big lever, so bias small: "a little while ago" / "earlier today" → `since=2h`, not `7d` or `30d`. Add `agent` / `status` / `category`, `sort=recent`, and a small `limit` (~10). Read `facets` to confirm what's even in the window.
2. **Scan only those candidates.** For each id, `GET /api/traces/:id/conversation` and grep for the phrase; stop at the first match. 5–10 recent conversations is cheap.
3. **Widen one step at a time** (`2h` → `24h` → `7d`) only if a scan misses — never jump straight to a 30-day grep-everything. If a genuinely large sweep is unavoidable, `?detail=dump` each candidate and grep the files rather than holding them in context.

## Reasoning discipline

- **Read the JSON yourself; report the load-bearing bits.** Don't paste raw API responses back at the user — they came to you to be told *why*, not to read JSON.
- **Start truncated, lift caps only when an answer is hidden.** Default truncation is usually enough. Reach for `?detail=full` on a single span, not a whole trace; use `?detail=dump` for genuinely huge payloads (it writes a file and returns the path — grep it rather than overflowing context).
- **It's read-only.** No writes, annotations, or re-runs through this API.

When you need response-field shapes to interpret what came back (conversation event kinds, what's in `aggregates`, the `window.capped` vs `has_more` distinction), see [`references/endpoints.md`](references/endpoints.md) — it covers interpretation the catalog omits, not the endpoint list itself.
