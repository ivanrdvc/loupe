# TODO — HTTP API for LLM debugging

agentops's value over raw OTel is the classification, conversation reconstruction, and aggregation we already do in `src/lib/`. The HTTP API exposes those same views over plain endpoints so an LLM-driven dev tool (Claude Code, Cursor, anything with a fetch) can pull run data while a developer is debugging — "why did my last run blow up" answered by the LLM itself, not by paste-and-pray.

Localhost only, read-only, no auth. A Claude Code skill discovers it; the API itself stays transport-agnostic. Explicitly *not* MCP — protocol tax not justified for in-house local access, and we don't want to ship the bloat we're already planning to lint against in `mcp.md`.

## How it works

- Routes live under `src/routes/api/` (file-based, same convention as the rest of the app).
- Handlers reuse `classify-span.ts`, `conversation.ts`, and the run aggregation already feeding `/runs/$runId`. The brief is a server-side render of the conversation view as markdown.
- TanStack Start dev/prod server binds to `127.0.0.1` only for v1. No CORS, no auth — same-machine trust.
- Payloads are LLM-shaped *by default*: markdown for briefs, JSON for lists/structured data, hard size caps with `?detail=full` as the escape hatch.

## Decided

- **Localhost only, no auth in v1.** Bound to `127.0.0.1`. Remote / hosted access is a separate plan once it matters.
- **Read-only.** No POST, PATCH, DELETE. Annotations / tags / re-runs are a future plan, not bolted onto this one.
- **Markdown for briefs, JSON for lists.** A `Run brief` is meant to be *read* by an LLM — markdown wins. A `list runs` response is meant to be filtered/iterated — JSON wins. `?format=` overrides where it matters.
- **Hard size caps on default responses.** ~5 KB per run brief, ~10 KB per list response. Tool I/O truncated to ~500 chars each side with `[+N bytes truncated]` markers. `?detail=full` returns untruncated payloads (for when the LLM actually needs the full tool result).
- **Errors always shown in full.** Truncation is for happy-path tool I/O — the whole point of debugging access is to see error context.
- **One file per endpoint** under `src/routes/api/`. Matches the route convention. Brief-rendering logic lives in `src/server/brief.ts`, shared across endpoints.

## Endpoints

All under `/api/`. Response shape sketched, not finalized.

- `GET /api/runs/recent?since=1h&limit=20&project=<id>` — JSON list. Fields: `id, started_at, duration_ms, status, model, total_cost_usd, error_summary?, tool_call_count`.
- `GET /api/runs/:id/brief` — markdown. Sections: header (model, duration, cost, status), timeline of tool calls with truncated I/O, errors block (full), final assistant message. Default LLM-shaped payload.
- `GET /api/runs/:id?format=json` — full structured run + spans. Heavier; the JSON escape hatch.
- `GET /api/runs/:id/spans/:spanId?detail=full` — single span with untruncated I/O. The "zoom in" call after reading a brief.
- `GET /api/runs/:id/errors` — markdown list of error/failed spans only. Used when the brief points at a failure and the LLM wants just the error context.

Search is **open** (see below). If included, it's:

- `GET /api/search?q=<query>&since=24h` — JSON list of run summaries matching free-text query across messages, tool names, errors.

## Open

- **Search in v1?** Either ship a minimal grep-over-recent-runs implementation, or skip and rely on the LLM fetching `recent` then drilling into specific runs. Lean toward *skip in v1* — the dev usually knows which run is broken, and grep-style search invites scope creep.
- **Project / session scoping.** Multi-project users need `?project=<id>` everywhere. Default to "current project from cwd" if the skill passes it; otherwise return across all and let the LLM filter. Decide once project switching lands in the UI.
- **Live runs.** Does `/runs/:id/brief` work on an in-flight run, or only completed ones? TODO already flags live ingest as future — for v1, brief returns whatever spans have landed, marked `status: in_progress`. Decision deferred until live ingest lands.
- **Brief shape — what exactly is in 5 KB?** First cut: 10 most recent tool calls, each ≤ 500 chars in/out; all errors in full; final assistant message ≤ 1 KB. Tune after first real use. Surface `gen_ai.task.parent.id` for run lineage (so the LLM sees orchestrator vs subagent context) and `tag.tags` in the header (env/tenant). See [`../explanation/02-spec.md`](../explanation/02-spec.md) for the canonical attrs.
- **Cost / token aggregates as separate endpoint, or inlined in brief header?** Inlined for v1 (it's a small number); break out only if a dedicated `/cost` endpoint earns its keep.

## Brief shape (sketch)

```markdown
# Run abc123

- model: claude-sonnet-4-6
- started: 2026-05-12T10:14:22Z
- duration: 12.4s
- status: error
- cost: $0.034
- tokens: 8,210 in / 1,402 out

## Errors

1. Tool `write_file` failed at span xyz789:
   ENOENT: no such file or directory '/nonexistent/path/foo.txt'

## Timeline

1. user → "refactor the auth module..."
2. assistant: planned 3 steps, calling read_file
3. read_file("src/auth.ts") → "export function login..." [+1.2 KB truncated]
4. assistant: calling write_file
5. write_file("/nonexistent/path/...") → ERROR (see above)

## Final message

(assistant errored before final response)
```

## Build

- [ ] `src/server/brief.ts` — markdown brief renderer from a run id. Reuses `classify-span.ts` + `conversation.ts`.
- [ ] `src/server/truncate.ts` — string + JSON truncation helpers with `[+N bytes]` markers. Used by brief + span endpoints.
- [ ] `src/routes/api/runs/recent.ts` — list endpoint, JSON.
- [ ] `src/routes/api/runs/$runId/brief.ts` — markdown brief.
- [ ] `src/routes/api/runs/$runId/index.ts` — JSON full run.
- [ ] `src/routes/api/runs/$runId/spans/$spanId.ts` — single span detail.
- [ ] `src/routes/api/runs/$runId/errors.ts` — errors-only markdown.
- [ ] Verify dev + prod server binds `127.0.0.1` only.
- [ ] `docs/reference/http-api.md` — endpoint reference table.
- [ ] Follow-up (separate task, not in this plan): Claude Code skill at `.claude/skills/agentops/SKILL.md` that triggers on debug-shaped questions and knows the endpoint URLs.

## Not in v1

- Auth, tokens, CORS, remote access.
- Writes — annotations, tags, comments, re-runs.
- Free-text search across all runs (see Open).
- Streaming / SSE for live runs (covered by live-ingest plan).
- Rate limiting (localhost, single user — irrelevant).
- The skill itself — separate ship after the API lands.
- MCP. Stays off the table. If a future LLM tool can't shell out or fetch, we'll revisit, but the HTTP API stays the canonical surface.
