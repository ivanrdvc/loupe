---
name: probe
description: Diagnose what the loupe dashboard sees for a session or trace — empty Sessions page, missing trace, wrong user, missing attributes. Use when the user pastes a session/trace UUID, a `localhost:<port>/sessions/<id>` URL, or asks "why is this empty / why doesn't it show / what attributes are on this span". Trigger on bare UUIDs in the loupe repo without asking — the user expects a lookup.
---

# loupe probe

This skill diagnoses what the loupe dashboard sees (or doesn't see) for a given session, trace, or the data stream as a whole. It's about debugging the _consumer side_ — "why is X empty / wrong / missing" — by comparing what the producer actually emitted against what loupe looks for.

## When this fires

User says:

- A bare UUID like `81c71a6a-5ebf-4f4c-ae01-062e4174cf13`
- A URL like `localhost:3000/sessions/<id>` or `localhost:3002/sessions/<id>?range=7&view=spans`
- "why is the sessions page empty"
- "what attributes does this span/trace have"
- "no sessions showing up"
- "this session doesn't appear"
- "check session X" / "look at trace X"

If you're in the loupe repo and see a bare UUID, treat it as a session/trace id and look it up. Don't ask for confirmation.

## How to run it

One command. Don't write raw curls — the script handles auth, provider detection, and the lean-output shaping.

```bash
python3 .agents/skills/probe/scripts/query.py <id-or-url>
```

The script:

1. Reads `.env` to find `TELEMETRY_PROVIDER` (defaults to `openobserve`)
2. For App Insights: uses `APPLICATIONINSIGHTS_APP_ID` + `_API_KEY` via the REST API
3. For OpenObserve: uses `OO_BASE_URL` / `OO_USER` / `OO_PASS` defaults
4. Resolves the id (matches `operation_Id`, `ag_ui_thread_id`, `session_id`, `gen_ai_conversation_id`, or any `customDimensions` substring)
5. Returns lean JSON — see the shape below

### Variants

```bash
python3 .agents/skills/probe/scripts/query.py --audit          # org-wide key-drift audit
python3 .agents/skills/probe/scripts/query.py <id> --full      # include tool args/results (heavy)
```

Use `--audit` when the user complains the Sessions page is empty _in general_ (not for a specific id) — it counts dotted-vs-underscore session-key drift across the whole stream.

## Reading the output

The JSON has this shape — focus on the diagnostic fields, not the timeline:

```json
{
  "session_id": "...",
  "provider": "app-insights" | "openobserve",
  "trace_ids": ["..."],
  "traces": [{
    "trace_id": "...",
    "span_count": 32,
    "timeline": [/* only AI-relevant spans: invoke_agent, chat, execute_tool, errors, purpose-tagged */],
    "tool_calls": [{"tool": "...", "duration_ms": N, "args_preview": "...", "result_preview": "..."}],
    "errors": [{"span": "...", "id": "..."}],
    "tokens": {"input": N, "output": N},
    "user_id": "...",
    "session_keys_present": ["ag_ui.thread_id", "ag_ui_thread_id", ...],
    "key_drift": {"sessionId": [...], "session_only_underscore": [...], "purpose": [...]}
  }]
}
```

### What each field tells you

| Field                                                               | What to check                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `trace_ids: []` (empty)                                             | No data for this id. Wrong id, wrong env, or outside the time window (3d AI / 7d OO).                                                                                                                                                                                    |
| `timeline`                                                          | Quick agent flow — invoke_agent, chat models, tool calls, purposes. Filters out generic HTTP / DB / queue spans by default.                                                                                                                                              |
| `errors`                                                            | Spans with `success=false`. Cite the span name.                                                                                                                                                                                                                          |
| `key_drift.sessionId` (multiple entries)                            | Same concept (`thread_id`) appears under multiple key names. App Insights customDimensions can carry both `ag_ui.thread_id` (dotted) and `ag_ui_thread_id` (underscore) depending on which SDK wrote it; loupe' `aiCoalesce` must check both forms via `bothForms()`. |
| `key_drift.session_only_underscore`                                 | Trace has only underscore form, no dotted. If loupe looks for dotted-only, the trace won't appear on the Sessions page.                                                                                                                                               |
| `purpose` field on a span                                           | Standard key: `gen_ai.operation.purpose`. Legacy data may show `teammate.llm.purpose` (pre-refactor); new producer emits the standard key.                                                                                                                               |
| `key_drift.purpose_on_ancestor_not_on_chat`                         | Purpose lives on parent Activity, not on the `chat` span. `propagateInheritedAttrs` lifts it down automatically for the standard key.                                                                                                                                    |
| `key_drift.unrecognized_session_keys` / `unrecognized_purpose_keys` | Producer emitted these keys but loupe won't read them under current config. Either add to `conventions.ts` (if standard) or set the matching `CUSTOM_*_FIELD` env var.                                                                                                |
| `env_health` (per-session output)                                   | Non-empty means a `CUSTOM_*_FIELD` env value contains chars that `field-config.ts` `ident()` silently drops (anything outside `[A-Za-z0-9_.]`). Fix the env value or relax the regex.                                                                                    |
| `tokens`                                                            | Per-trace LLM token total. Useful for "why is this run so expensive".                                                                                                                                                                                                    |

## Diagnostic playbook

### "The Sessions page is empty"

1. Run `query.py --audit` first.
2. Check `env_health` — silent drops from `field-config.ts ident()` mean a `CUSTOM_*` override isn't taking effect even though it's set.
3. Check `emitted_keys_unrecognized_for_concept` — these are session/user/purpose keys the producer is emitting that loupe doesn't recognize. Top of that list is your fix target (add to `conventions.ts` or `CUSTOM_*_FIELD`).
4. Compare `traces_with_dotted` to `traces_with_only_underscore`. If underscore dominates, loupe' KQL coalesce is missing the underscore form — fix `aiCoalesce` in `src/lib/telemetry/conventions.ts` to run keys through `bothForms()`.
5. If `traces_in_listSessions_filter` is 0, the producer isn't emitting `gen_ai.operation.name`, `invoke_agent`, `execute_tool`, or `session.trigger_type` on any span — producer-side instrumentation issue.

### "This specific session/trace doesn't show"

1. Run `query.py <id>`.
2. If `trace_ids` is empty: id is wrong or outside the time window.
3. If `traces[0].session_keys_present` is empty: the producer never stamped a session attribute on any span in this trace. Sessions page filters those out (they show on `/traces` instead).
4. If `session_keys_present` is non-empty but the page still doesn't show it: check `key_drift` — could be the dotted/underscore mismatch.

### "Wrong user / no user on this session"

Look at `user_id` per trace. If null, no span in the trace had `user.id` / `enduser.id` / `ag_ui.user.id`. The producer needs to stamp one of those — or, if it emits a non-standard key, set `CUSTOM_USER_ID_FIELDS` in `.env`.

### "Env override I set isn't taking effect"

`field-config.ts` `ident()` (regex `^[A-Za-z0-9_.]+$`) silently drops any value with disallowed chars (spaces, dashes, brackets, etc.). The script flags this via `env_health`. Either fix the env value or relax the regex if the char is actually safe downstream.

### "Why no tool_calls on this chat span"

Check `finish` in the timeline entry. If it's `["stop"]`, the model chose not to call tools — it just replied. If it's `["tool_calls"]` but no `execute_tool` children appear, there's a span-linking issue. Cached tokens usually mean the model already has tool results from a prior turn.

### "Why no purpose tag on this chat span"

`propagateInheritedAttrs` copies `operationName` from parent to child. For it to work, the parent span must have `gen_ai.operation.purpose` set (the standard key). Legacy data may only have `teammate.llm.purpose` (pre-refactor) — that key isn't in `conventions.ts` by default. New data uses the standard key and propagation works automatically.

### "Span attribute X seems missing"

The script only normalizes session/user/purpose keys. For other attributes, re-run with `--full` to dump raw, or fall back to a targeted query against the provider directly (script source has working `query_app_insights()` and `query_openobserve()` helpers — copy the pattern).

## What this skill is NOT for

- **Producer-side agent-flow analysis** (which sub-agent did what, internal orchestration, framework-specific issues): out of scope. This skill works from telemetry only — it tells you what the producer emitted, not what the producer should have done internally.
- **Free-form OpenObserve SQL exploration**: the `openobserve` skill is better for that. Use `debug` when the question is session/trace-shaped.

## Don't

- Don't paste the full JSON back to the user — summarize what's load-bearing. The script's output is for _you_ to read.
- Don't run `--full` by default — payloads are large and blow context.
- Don't curl App Insights / OpenObserve manually unless the script genuinely can't answer; the auth and shape are already handled.
- Don't restate the timeline if the answer is just "this trace has no session attribute, that's why."
