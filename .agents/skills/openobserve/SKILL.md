---
name: openobserve
description: Query a local OpenObserve instance for traces — especially AI agent / LLM spans (gen_ai_*, llm_*, openai_*, ag_ui_* attributes from OpenLLMetry / Pydantic Logfire / OpenInference instrumentation). Use whenever the user wants to inspect, fetch, summarize, or search OpenObserve trace data — agent runs, LLM calls, tool calls, sub-agent invocations, token usage, cost, model/provider — even if they don't say "OpenObserve" explicitly (e.g. "show me my latest agent run", "what did this agent call", "fetch the spans from trace abc123", "how much did this run cost"). Also use for raw OpenObserve search queries on its export API, with auth and time-range handling already wired up.
---

# OpenObserve trace querying

This skill teaches Claude to talk to a local OpenObserve instance and extract AI/LLM trace data. It's optimized for the common observability case: someone is running an agent (CrewAI, OpenAI Agents SDK, Mastra, etc.) instrumented with OpenLLMetry / Pydantic Logfire / OpenInference, those tools push OTel spans to a local OpenObserve, and Claude needs to fetch and reason about them.

## When this fires

User says things like:
- "show me trace `<id>`"
- "what tools did my agent call"
- "fetch the gen_ai spans"
- "how much did this run cost"
- "list recent agent runs"
- "query openobserve for `<X>`"

Even if they don't name OpenObserve, if the local URL is `localhost:5080` or you can see `openobserve` in their `docker-compose.yml` / env, it's the right tool.

## Connection setup

OpenObserve runs locally with HTTP Basic auth. Defaults (from the official `openobserve/openobserve` docker image):

| Variable | Default |
|---|---|
| `OO_BASE_URL` | `http://localhost:5080` |
| `OO_ORG` | `default` |
| `OO_STREAM` | `default` |
| `OO_USER` | `root@example.com` |
| `OO_PASS` | `Complexpass#123` |

The user may have overridden them — check `docker-compose.yml` (`ZO_ROOT_USER_EMAIL` / `ZO_ROOT_USER_PASSWORD`) or `.env` files first if defaults fail. Auth header is `Basic <base64(user:pass)>`.

## The search endpoint

```
POST {base}/api/{org}/_search?type=traces
Authorization: Basic <token>
Content-Type: application/json

{
  "query": {
    "sql": "SELECT * FROM \"<stream>\" WHERE <predicate>",
    "start_time": <microseconds_since_epoch>,
    "end_time": <microseconds_since_epoch>,
    "from": 0,
    "size": 1000
  }
}
```

- `type=traces` selects the traces backend (omit for logs, use `metrics` for metrics).
- `start_time` / `end_time` are **microseconds since Unix epoch** — not millis, not nanos.
- `size` caps results; a single trace usually has <100 spans.
- Span timestamps inside the response are **nanoseconds** (`start_time` / `end_time` per span). Duration is **microseconds**. Yes, this is inconsistent — convert when displaying.

## Use the bundled script

For anything more than a one-shot probe, use `scripts/query.py` instead of curling by hand. It handles auth, env-var fallbacks, time ranges, and pretty-printing.

```bash
# Fetch all spans for a trace
python scripts/query.py trace <trace_id>

# Fetch within a tighter time window (microseconds)
python scripts/query.py trace <trace_id> --from 1778542912186073 --to 1778542941562639

# List recent traces that have LLM activity in the last hour
python scripts/query.py recent --minutes 60

# Raw SQL
python scripts/query.py search "SELECT trace_id, operation_name, duration FROM \"default\" WHERE gen_ai_operation_name='chat' ORDER BY _timestamp DESC LIMIT 20"

# Just print a compact summary (one line per span, tree-shaped)
python scripts/query.py trace <trace_id> --summary
```

Env vars override defaults if set (`OO_BASE_URL`, `OO_USER`, `OO_PASS`, `OO_ORG`, `OO_STREAM`).

## Common SQL patterns

```sql
-- All spans of a single trace
SELECT * FROM "default" WHERE trace_id='<id>'

-- All chat (LLM) spans across recent traces
SELECT * FROM "default" WHERE gen_ai_operation_name='chat'

-- All tool invocations
SELECT * FROM "default" WHERE operation_name LIKE 'execute_tool%'

-- All sub-agent invocations (the orchestrator-spawning-another-agent pattern)
SELECT * FROM "default" WHERE operation_name LIKE 'invoke_agent%'

-- Top cost spans
SELECT trace_id, operation_name, llm_usage_cost_total
FROM "default"
WHERE llm_usage_cost_total IS NOT NULL
ORDER BY llm_usage_cost_total DESC LIMIT 20
```

## Reconstructing the span tree

The response is a flat list. Each span has:
- `span_id` — this span's id
- `reference_parent_span_id` — parent span id (empty for the root)
- `trace_id` — same across the whole trace
- `start_time` (ns) and `duration` (μs) — sort children by `start_time` for chronological order

The root is the span whose `reference_parent_span_id` is empty/null. Build the tree by indexing `byParent.set(parent_span_id, [...])`.

## AI/LLM attribute reference

OpenObserve flattens dotted OTel attributes into underscore-separated keys, so `gen_ai.usage.input_tokens` becomes `gen_ai_usage_input_tokens`. The full catalog — including OpenAI-specific, Logfire `llm_*`, CopilotKit `ag_ui_*`, span structural fields, and the agent-as-tool detection rule — lives in the project's [`docs/reference/ai-attributes.md`](../../../docs/reference/ai-attributes.md). Read that file when you need to interpret a span's payload, especially `llm_input` (the full chat history) and `llm_output` (the assistant reply with embedded tool calls).

## Output advice

When the user asks "what's in this trace", default to:

1. A tree summary (operation_name, duration, agent/tool, tokens, cost) — use `--summary` from the script.
2. Highlight the LLM turns specifically: orchestrator → tool calls → sub-agent invocations.
3. Save the full JSON to a temp file if it's large; show the user the path instead of dumping 30KB into the chat.

When the user asks about cost or token usage, prefer `llm_usage_cost_total` (already-computed) over deriving from `llm_usage_tokens_*`.

## Adjacent observation

OpenObserve also stores logs and metrics. The same endpoint serves all three — just change `?type=traces` to `?type=logs` or `?type=metrics`. If the user pivots to non-trace data, the script's `search` subcommand still works; just pass `--type logs` (and the script accepts that).
