# HTTP API reference

Read-only, localhost-only JSON API exposing loupe's processed views — classified spans, reconstructed conversation, summed aggregates — so an LLM-driven dev tool can pull run data while a developer debugs. Thin route handlers live under `src/routes/api/`; the logic is the `query` feature slice (`src/features/query/` — `logic/` shape+respond, `server/` handlers).

> **Terminology:** loupe has no "run" entity — **a trace _is_ the run**; a session bundles many traces.

## Binding & trust model

- **No auth, no CORS, read-only** (no POST/PATCH/DELETE). Same-machine trust only.
- **Dev** (`vite dev`) binds `localhost` — fine as-is.
- **Prod** (nitro) defaults to `0.0.0.0`. You **must** set `HOST=127.0.0.1` or this no-auth API leaks all telemetry on a shared box.

## Context guard (every data primitive)

- Tool / LLM I/O is **truncated to ~400 chars** per field by default, with a `[+N chars truncated]` marker. **Errors are never truncated.**
- `?detail=full` — untruncated I/O.
- `?detail=raw` — include each span's `rawAttributes` bag (escape hatch when classification hid something).
- `?detail=dump` — write the full JSON to a temp file, return `{ dumped, path, bytes, summary }` instead of inlining. Any response over ~300 KB (including `detail=full`/`raw`) auto-dumps the same way — a file path the agent can grep beats overflowing its context.

## Endpoints

`GET /api` returns a self-describing index (endpoint list + compose loop) — the landing point for an agent that hasn't read this doc.

### Discovery — `GET /api/search`

One steered research primitive. Fetches a bounded recent window (default `7d`, up to 500 rows) and filters / free-text-searches / sorts **in-memory** — so the agent composes any combination of filters without a query language, and without coupling to the provider's SQL/KQL dialect. Drill into a hit with the getters below.

Params (all optional, AND-combined):

| Param | Meaning |
| --- | --- |
| `entity` | `traces` (default) or `spans` (sub-agent + utility spans). |
| `since` | `24h` `7d` `90m` `2w` or bare number = days. Default `7d`. |
| `limit`, `offset` | Page size (1–100, default 20) and offset. |
| `sort` | `recent` (default) · `cost` · `tokens` · `duration`. |
| `q` | Free-text substring over **metadata** (agent, operation, service, session, model, names). Not message/tool-I/O content — see Deferred. |
| `status` | `error` or `ok`. |
| `agent` | Substring on agent name (traces) / sub-agent label (spans). |
| `model` | Substring on model id (`entity=spans`). |
| `session`, `user`, `category` | Substring / exact on those fields. |
| `min_cost`, `min_tokens`, `min_duration_ms` | Numeric floors. |

Returns `{ entity, provider, window: { since, scanned, capped }, page: { total, limit, offset, has_more }, results: [...], facets }` — page over the filtered hits with `offset` so a wide window never overflows the caller. `window.capped` (scan hit the 500-row cap) means `has_more=false` is "end of window", not "of all data" — widen `since` to see older runs. `facets` lists the distinct values seen in the window (agents / categories / services, or models / kinds for spans) so the agent learns what it can filter on. Trace result fields: `id, started_at, duration_ms, status, agent, operation, category, span_count, total_tokens, total_cost_usd, session_id, user`.

**Deferred:** tool-name filtering and free-text over message / tool-I/O content aren't in the summary rows — those need full span bodies (use the drill-in getters + `?detail=full`). Full-history search (vs. the window) would need provider-side pushdown.

### Drill-in

| Method & path | Purpose |
| --- | --- |
| `GET /api/traces/:id` | One trace as **classified spans** (the tree loupe built) + summed `aggregates`. `?detail=full\|raw\|dump`. |
| `GET /api/traces/:id/conversation` | The **reconstructed** conversation: ordered `message` / `tool_call` / `tool_result` / `agent_call` events. Paged (`limit` default 100 ≤500, `offset`). |
| `GET /api/traces/:id/spans/:spanId` | A single span, **full untruncated I/O**. The zoom-in after a list or trace pull. Trace-scoped (reuses `getTrace` + by-id find). |
| `GET /api/sessions/:id` | Session → `trace_ids`, per-trace + overall `aggregates`. `?detail=full` inlines the merged span tree. |

`aggregates`: `status, span_count, error_count, started_at, duration_ms, total_tokens, input_tokens, output_tokens, cached_tokens, total_cost_usd, agent, operation, model, session_id`. Tokens/cost are summed from leaf calls (`invoke_agent` roll-up wrappers are excluded to avoid double-counting).

### Convenience

| Method & path | Purpose |
| --- | --- |
| `GET /api/traces/:id/brief` | Markdown render: header + errors + timeline + final message. A shortcut for "explain this run." |
| `GET /api/sessions/:id/brief` | Markdown render for a whole session. |

## Compose loop

`GET /api/search?status=error&sort=cost` (read `facets` to learn the dimensions) → pick the `id` → `GET /api/traces/:id` (or `/conversation`) → `GET /api/traces/:id/spans/:spanId` to zoom → add `?detail=full` when truncation hides the answer.

## Not in v1

Auth / tokens / CORS / remote access · writes · free-text search across all traces · streaming for live runs · rate limiting · MCP (the HTTP API is the canonical surface).
