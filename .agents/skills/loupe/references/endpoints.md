# loupe HTTP API — endpoint reference

Read-only JSON over `${LOUPE_BASE_URL:-http://localhost:3000}`. A trace **is** a run; a session bundles many traces. All paths under `/api/`.

## Context guard (every data endpoint)

Tool / LLM I/O is truncated to ~400 chars per field by default with a `[+N chars truncated]` marker. **Errors are never truncated.**

- `?detail=full` — untruncated I/O.
- `?detail=raw` — include each span's raw OTel attribute bag.
- `?detail=dump` — write full JSON to a temp file, return `{ dumped, path, bytes, summary }`. Any response over ~300 KB (incl. `detail=full`/`raw`) auto-dumps the same way — grep the file rather than overflow context.

## Discovery — `GET /api/search`

One steered research primitive: fetches a bounded recent window (default `7d`, ≤500 rows) and filters / free-text-searches / sorts **in-memory**. Combine any params; AND-combined.

| Param | Meaning |
| --- | --- |
| `entity` | `traces` (default) or `spans` (sub-agent + utility spans). |
| `since` | `24h` `7d` `90m` `2w` or bare number = days. Default `7d`. |
| `limit`, `offset` | Page size (1–100, default 20) and offset. |
| `sort` | `recent` (default) · `cost` · `tokens` · `duration`. |
| `q` | Substring over **metadata** (agent, operation, service, session, model, names) — not message/tool content. |
| `status` | `error` \| `ok`. |
| `agent` | Substring on agent (traces) / sub-agent label (spans). |
| `model` | Substring on model id (`entity=spans`). |
| `session`, `user`, `category` | Field match. |
| `min_cost`, `min_tokens`, `min_duration_ms` | Numeric floors. |

```json
{ "entity": "traces", "provider": "openobserve",
  "window": { "since": "7d", "scanned": 51 },
  "page": { "total": 2, "limit": 20, "offset": 0, "has_more": false },
  "results": [ { "id": "...", "started_at": "...", "duration_ms": 10904, "status": "error",
    "agent": "...", "operation": "invoke_agent", "category": "chat", "span_count": 12,
    "total_tokens": 17407, "total_cost_usd": 0.00117, "session_id": "...", "user": "..." } ],
  "facets": { "agents": ["..."], "categories": ["chat"], "services": ["..."] } }
```

`facets` lists distinct values seen in the window — read it to learn what to filter on. `window.capped: true` means the scan hit its 500-row cap, so `has_more=false` is end-of-window, not end-of-data — widen `since`. **Deferred:** tool-name filtering + free-text over message/tool-I/O content (drill in + `?detail=full`), and full-history search beyond the window.

## Drill-in

### `GET /api/traces/:id`
Classified spans as the tree loupe built + summed `aggregates`. `?detail=full|raw|dump`.

```json
{ "trace_id": "...", "provider": "...", "truncated": false,
  "aggregates": { "status": "ok", "span_count": 12, "error_count": 0, "started_at": "...",
    "duration_ms": 10905, "total_tokens": 17407, "input_tokens": 16537, "output_tokens": 870,
    "cached_tokens": 8064, "total_cost_usd": 0.00117, "agent": "...", "operation": "invoke_agent",
    "model": "gpt-5-nano", "session_id": "..." },
  "spans": [ { "id": "...", "parent_id": null, "name": "...", "operation": "chat",
    "kind": "client", "start_ms": 0, "duration_ms": 3500, "agent": "...", "tool": "...",
    "model": "...", "tokens": { "input": 0, "output": 0, "cached": 0 }, "cost_usd": 0,
    "error": { "type": "...", "message": "...", "stack": "..." },
    "input": "...", "output": "...", "children": [ ... ] } ] }
```

Tokens/cost are summed from leaf calls; `invoke_agent` roll-up wrappers are excluded so totals aren't double-counted.

### `GET /api/traces/:id/conversation`
Reconstructed, ordered events — paged (`limit` default 100 ≤500, `offset`; check `page.has_more`). Discriminated by `kind`:

- `message` — `{ role, content, timestamp, spanId, inputTokens?, outputTokens? }`
- `tool_call` — `{ toolName, arguments, callId, spanId }`
- `tool_result` — `{ callId, result, success, error?, spanId }`
- `agent_call` — `{ agentName, input, result, spanId }` (a sub-agent boundary)

### `GET /api/traces/:id/spans/:spanId`
A single span, full untruncated I/O — the zoom-in. Trace-scoped (no separate span store). `?detail=raw` adds `rawAttributes` + `truncatedAttrs`.

### `GET /api/sessions/:id`
Session spine: `trace_ids`, overall `aggregates`, and per-trace `aggregates`. `?detail=full` inlines the merged span tree.

```json
{ "session_id": "...", "title": "...", "source": "attribute", "provider": "...",
  "trace_ids": ["..."], "aggregates": { ... },
  "traces": [ { "id": "...", "aggregates": { ... } } ] }
```

## Convenience (markdown)

### `GET /api/traces/:id/brief` · `GET /api/sessions/:id/brief`
Prose render: header (model/started/duration/status/cost/tokens) + errors (full) + timeline + final message. A shortcut for "explain this run," not the only door.

## Compose loop

`GET /api/traces?since=…` → pick the broken `id` → `GET /api/traces/:id` (or `/conversation`) → `GET /api/traces/:id/spans/:spanId` → add `?detail=full` when truncation hides the answer.
