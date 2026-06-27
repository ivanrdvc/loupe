# loupe HTTP API — reading the responses

`GET $BASE/api` is the canonical endpoint list, filter set, and `detail` rules — curl it instead of trusting any table here. This file only covers what the catalog leaves out: the **shape of the responses** and a few non-obvious semantics, so you can interpret (and grep) results without re-fetching to find a field name.

A trace **is** a run; a session bundles many traces. Everything is read-only JSON under `/api/`.

## `/api/search` (and its alias `/api/traces`)

Scans a bounded recent window (default `7d`, ≤500 rows) and filters / sorts in memory; params AND-combine. Two fields steer what to do next:

- **`facets`** — distinct `agents` / `categories` / `services` actually present in the window. Read it to learn what's there before narrowing, rather than guessing filter values.
- **`window.capped: true`** — the scan hit its 500-row cap, so `page.has_more: false` means *end of the scanned window*, not end of data. Widen `since` to see more. (`has_more` alone is just pagination within what was scanned.)

`q` is **metadata-only** (agent / model / operation / service / session / names). Message text and tool I/O are not indexed — see SKILL.md "Finding a run by something said in it." Full-history search beyond the window is deferred.

Each result row carries `id`, `status`, `agent`, `operation`, `category`, `span_count`, `total_tokens`, `total_cost_usd`, `duration_ms`, `session_id`, `user` — enough to triage without opening the trace.

## `/api/traces/:id` — span tree + aggregates

`aggregates` is the run summary: `status`, `span_count`, `error_count`, `duration_ms`, `total_tokens` (+ `input`/`output`/`cached`), `total_cost_usd`, `agent`, `model`, `session_id`.

Non-obvious: **tokens and cost are summed from leaf LLM calls only** — `invoke_agent` roll-up wrappers are excluded so a sub-agent's usage isn't double-counted against its parent. So a wrapper span showing `cost_usd: 0` is normal, not a bug.

Each span: `id`, `parent_id`, `name`, `operation` (`chat`, `execute_tool`, `invoke_agent`, …), `start_ms`, `duration_ms`, `agent`, `tool`, `model`, `tokens`, `cost_usd`, `input`, `output`, nested `children`, and `error { type, message, stack }` when it failed. Errors are never truncated.

## `/api/traces/:id/conversation` — reconstructed events

Ordered, paged (`limit` default 100 ≤500, `offset`; watch `page.has_more`). Each event is discriminated by `kind` — useful to know when grepping a dump:

- `message` — `{ role, content, timestamp, spanId, inputTokens?, outputTokens? }`
- `tool_call` — `{ toolName, arguments, callId, spanId }`
- `tool_result` — `{ callId, result, success, error?, spanId }`
- `agent_call` — `{ agentName, input, result, spanId }` — a sub-agent boundary

## `/api/traces/:id/spans/:spanId` — one span, full I/O

The zoom-in: untruncated `input`/`output` for a single span without lifting `detail` on the whole trace. `?detail=raw` adds `rawAttributes` + `truncatedAttrs` (the raw OTel bag) when you need to confirm what was actually emitted.

## `/api/sessions/:id` — session spine

`trace_ids`, overall `aggregates`, and per-trace `aggregates` (`traces[].aggregates`). `?detail=full` inlines the merged span tree across the session. Use it to find which trace in a multi-run session went wrong, then drill into that trace.

## `detail` tiers (recap)

`full` untruncated I/O · `raw` adds the OTel attribute bag · `dump` writes full JSON to a temp file and returns `{ dumped, path, bytes, summary }`. Any response over ~300 KB auto-dumps the same way — grep the file rather than overflow context.
