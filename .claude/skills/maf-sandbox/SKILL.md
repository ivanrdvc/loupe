---
name: maf-sandbox
description: Generate test telemetry for loupe by firing requests at a local Microsoft Agent Framework (MAF) Python agent that emits OTel spans to local OpenObserve. Use whenever the user wants to fire traces, produce spans, exercise telemetry shapes, generate test data for the loupe dashboard, verify how a particular pattern renders (parallel tool calls, subagent handoff, MCP tools, scheduled tasks, errors, streaming, token usage), or test the local OpenAI Responses endpoint — even if they don't say "MAF" or "sandbox" explicitly. Improvise the input each invocation; don't repeat payloads. Skip this skill when the user wants to *read* existing traces (that's the openobserve skill) or *diagnose* what loupe shows for a specific session id (that's the probe skill).
---

# MAF sandbox

Test rig for generating agent telemetry into local OpenObserve so we can inspect what loupe renders.

## Quick start

```bash
./fire.py "your prompt here"           # auto-starts sandbox, fires request, prints JSON
./fire.py "your prompt here" --stream  # SSE stream
```

`fire.py` handles everything: spawns `maf.py` via `uv` if not already running (logs → `/tmp/maf-sandbox.log`), discovers the entity_id, sends a correctly-shaped Responses API body, and returns the reply. The sandbox listens on `localhost:4280`, exports OTel to `http://localhost:5080/api/default` (OpenObserve), reads `OPENAI_API_KEY` from `loupe/.env.local`.

## Optional: dual-emit to App Insights

loupe reads from App Insights by default — so to make sandbox traces visible in the loupe UI, also set `APPLICATIONINSIGHTS_CONNECTION_STRING` in `loupe/.env.local`. Without it, sandbox traces land only in OpenObserve and **loupe will not see them**; `maf.py`'s startup banner prints a warning in that case. AppInsights export is purely additive — OO emission continues either way.

## What the sandbox agent can do

The agent (`sandbox-agent`) is wired to exercise these telemetry categories. **Pick a different one each session** — repeating the same payloads makes the rig pointless.

- **Single tool call** — `add`, `multiply`, `random_number`, `echo`, `lookup_user`
- **Parallel tool calls** — ask for the weather in several cities at once, or multiple math ops
- **Subagent handoff** — anything weather-flavored gets routed to `weather-specialist` (nested `invoke_agent` span)
- **MCP tools** — call `mock_mcp.flip_coin`, `roll_dice`, `current_time`, `translate`, `search_docs`, `crash`, etc. (12 stubs, separate stdio subprocess)
- **Scheduled run** — `schedule_task(prompt, delay_seconds)` enqueues a fresh agent run tagged `session.trigger_type=scheduled`; produces a separate trace
- **Errors** — `fail_sometimes(probability)` raises mid-tool; produces error spans
- **Streaming** — pass `--stream` to see SSE + chunked spans
- **Result shapes** — `list_items` returns arrays, `lookup_user` returns dicts (different span content shapes)

## Workflow

1. Fire a request: `./fire.py "..."` with an input chosen to exercise something interesting
2. Read the resulting spans via the `openobserve` skill, filtering `service_name=maf-sandbox`
3. Tell the user what attributes/shapes loupe would render — including anything missing, mangled, or that doesn't fit existing renderers

## Files

- `maf.py` — agent + tools + DevUI + OTel (PEP 723 script run via `uv`)
- `mcp_server.py` — mock MCP stdio server (12 stub tools, launched as subprocess)
- `fire.py` — request driver (use this, not raw curl, unless you specifically need to test a malformed payload)
