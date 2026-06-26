# TODO — HTTP API for LLM debugging

loupe's value over raw OTel is the classification, conversation reconstruction, and aggregation we already do in `src/lib/`. The HTTP API exposes those same processed views over plain endpoints so an LLM-driven dev tool (Claude Code, Cursor, anything with a fetch) can pull run data while a developer is debugging — "why did my last run blow up" answered by the LLM itself, not by paste-and-pray.

Localhost only, read-only, no auth. A Claude Code skill discovers it; the API itself stays transport-agnostic. Explicitly *not* MCP — protocol tax not justified for in-house local access, and we don't want to ship the bloat we're already planning to lint against in `mcp.md`.

## Architecture: expose primitives, not opinions (2026-06-26 pivot)

The first cut centered on a canned markdown **brief** — one rigid "here's what happened" render. That boxes the agent in: it can only ask the one question we pre-baked. The redesign inverts it — **expose loupe's processed data as thin, composable JSON primitives and let the agent compose them and narrate.** What loupe adds over raw OTel (classified spans, reconstructed conversation, filterable aggregates) is still the value — we just ship it as *queryable data*, not a fixed summary.

This matches the strongest competitor pattern (surveyed 2026-06-26): Braintrust bets on a tiny primitive set over a query language; LangSmith/Phoenix/Datadog expose per-entity `list_*` + `get_*` getters. The opinionated-brief platforms underinvest in agent flexibility. The two universal disciplines worth stealing:

1. **Search-then-drill-down.** A token-cheap filterable *list* primitive, separate from a fat *get-one* primitive. Never let the agent bulk-dump traces.
2. **Context-window engineering.** Truncate payloads by default; `?detail=full` lifts the cap; a **file-dump** escape hatch writes the full JSON to disk and returns a path + summary (cheap because we're local — straight out of LangSmith's char-budget pagination and avivsinai's output modes).

The markdown brief survives only as **one optional convenience** endpoint layered on the primitives — a shortcut for "explain this run," never the only door.

## How it works

- Routes live under `src/routes/api/` (file-based, same convention as the rest of the app).
- **Terminology:** the plan originally said "runs"; loupe has no run entity — **a trace *is* the run**, a session bundles many traces. Endpoints are `/api/traces/*` and `/api/sessions/*`.
- Handlers reuse the server-safe domain layer directly: `listRecentTraces` / `getTrace` / `getSession` (`src/lib/telemetry`), `buildConversation` (`src/lib/spans/conversation.ts`), `classifySpan` (`src/lib/spans/classify-span.ts`). Aggregates are summed from spans in the route (not `buildInspectorView`, whose per-turn totals zero out on agent-less traces). Pure helpers are deep-imported from `#/features/inspect/logic` to keep React/db out of the server bundle.
- **Binding is not localhost-only by default.** Dev (`vite dev`, no `--host`, `package.json:11`) binds localhost — fine. **Prod is nitro and defaults to `0.0.0.0`** (`vite.config.ts` `nitro/vite`), so v1 *requires* `HOST=127.0.0.1` or the no-auth read-only API leaks all telemetry on a shared box. Gated by the verify step (Build) — not yet true. No CORS, no auth — same-machine trust.
- Payloads are LLM-shaped *by default*: JSON primitives for data, markdown for the optional brief, hard size caps with `?detail=full` as the escape hatch.

## Decided

- **Localhost only, no auth in v1.** Dev binds localhost; **prod (nitro) needs `HOST=127.0.0.1` set explicitly** (see How it works + verify step). Remote / hosted access is a separate plan once it matters.
- **Read-only.** No POST, PATCH, DELETE. Annotations / tags / re-runs are a future plan, not bolted onto this one.
- **Primitives over a canned brief.** Ship loupe's processed data as thin composable JSON primitives; let the agent compose and narrate. The markdown brief is optional sugar, not the spine. (2026-06-26 pivot — see Architecture.)
- **JSON primitives, markdown for the brief.** Data primitives are filtered/iterated/recombined — JSON wins. The optional brief is *read* — markdown wins. `?detail=` / `?format=` override where it matters.
- **Hard size caps on default responses.** Tool I/O truncated to ~400 chars each side with `[+N chars truncated]` markers. `?detail=full` returns untruncated; file-dump for the huge ones. (Chars, not bytes — we measure string length.)
- **Errors always shown in full.** Truncation is for happy-path tool I/O — the whole point of debugging access is to see error context.
- **One file per endpoint** under `src/routes/api/`. Matches the route convention. Shared render/truncate helpers live in route-scoped `src/routes/api/-*.ts` files (there is no `src/server/`).

## Endpoints — the primitive set

All under `/api/`. JSON unless noted. Thin and composable; the agent picks and combines.

**Discovery (token-cheap, filterable):**
- `GET /api/traces?since=24h&limit=20&agent=` — list of trace summaries. Fields: `id, started_at, duration_ms, status (derived from hasError), agent, operation (rootOperation), total_cost_usd, total_tokens, session_id`. The search-then-drill entry point. `agent`→`TraceFilter.agentName` is free today; `status`/`q`/`project` are deferred (see Open).

**Drill-in:**
- `GET /api/traces/:id` — one trace as **classified** spans (the tree loupe built) + summed aggregates. Truncated I/O by default; `?detail=full` lifts caps; `?detail=raw` returns each span's `rawAttributes` bag (escape hatch for when classification hid something — "raw as stored": provider truncation per `truncatedAttrs` still applies).
- `GET /api/traces/:id/conversation` — the **reconstructed** conversation events (`buildConversation`): ordered messages / tool_calls / tool_results / agent_calls. loupe's reconstruction as data.
- `GET /api/traces/:id/spans/:spanId` — single span, full untruncated I/O. The "zoom in" after a list or trace pull. **Trace-scoped on purpose** — reuses `getTrace` + a by-id find, so it needs zero new provider method (there is no `getSpan` on the provider interface; OO could add one trivially, App Insights couldn't).
- `GET /api/sessions/:id` — session → `traceIds` + merged spans (multi-turn spine).

**Convenience (optional, layered on the above):**
- `GET /api/traces/:id/brief` · `GET /api/sessions/:id/brief` — markdown render of the conversation + aggregates. A shortcut for "explain this run," not the only door. (Prototyped then discarded in the pivot — rebuild on the primitives.)

**Context guard (every data primitive):** truncated by default (~400 chars/side on tool I/O, with `[+N chars truncated]`); `?detail=full` returns untruncated; for genuinely huge payloads, **file-dump** mode writes full JSON to a temp path and returns `{ path, summary }` instead of inlining.

## Open

- **Search / filter in v1?** Only `agent` is free today (`TraceFilter.agentName`, implemented in both providers). `status` is **not free** — it needs a new `TraceFilter.has_error` clause, though it's cheap (providers already compute `has_error`). `q` free-text needs in-memory grep over the window or new work. Lean toward *filters-light in v1*: ship `agent`, add `status` (cheap), defer `q` — the dev usually knows which run is broken, and grep-style search invites scope creep.
- **Project / session scoping.** No project/tenant filter exists on the provider interface (only `userId`/`serviceName`/`agentName`/`triggerTypes`). So `?project=` is **not buildable as-is** — either map it to `serviceName`, or defer until a real project field lands with UI project switching. Dropped from the v1 endpoint signature.
- **Live runs.** Does `/traces/:id/brief` work on an in-flight run, or only completed ones? TODO already flags live ingest as future — for v1, the brief returns whatever spans have landed, marked `status: in_progress`. Decision deferred until live ingest lands.
- **Brief shape — what exactly is in 5 KB?** First cut: 10 most recent tool calls, each ≤ 500 chars in/out; all errors in full; final assistant message ≤ 1 KB. Tune after first real use. Surface `gen_ai.task.parent.id` for run lineage (so the LLM sees orchestrator vs subagent context) and `tag.tags` in the header (env/tenant). See [`../docs/explanation/02-spec.md`](../docs/explanation/02-spec.md) for the canonical attrs.
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

Primitives first; brief is sugar. Truncation lives in a shared helper, not per-route.

_(A 4-file brief prototype — `-brief.ts`, `traces/recent.ts`, `traces/$traceId/brief.ts`, `sessions/$sessionId/brief.ts` — was built then discarded in the pivot. Rebuild on the primitives.)_

- [ ] `src/routes/api/-respond.ts` — shared `json()` / `markdown()` / truncate / file-dump helpers (build first; every route reuses it).
- [ ] `src/routes/api/traces/index.ts` — `GET /api/traces` list, JSON (`?since`/`limit`/`agent`; `status` next).
- [ ] `src/routes/api/traces/$traceId/index.ts` — JSON classified spans + aggregates; `?detail=full|raw`.
- [ ] `src/routes/api/traces/$traceId/conversation.ts` — JSON reconstructed conversation events.
- [ ] `src/routes/api/traces/$traceId/spans/$spanId.ts` — single span, full I/O. Trace-scoped (reuses `getTrace` + by-id find — no provider change).
- [ ] `src/routes/api/traces/$traceId/brief.ts` · `sessions/$sessionId/brief.ts` — markdown briefs (convenience, on the primitives).
- [ ] Verify binding: dev confirmed localhost; **prod must set `HOST=127.0.0.1`** (nitro defaults to `0.0.0.0`).
- [ ] `docs/reference/http-api.md` — endpoint reference table.

## Skill — a map, not logic (`.agents/skills/loupe/`)

**Audience: not loupe's own devs — the developers of *other apps* that use loupe as their observability backend.** Someone building an agent app (cookway, a customer's app, …) instruments it to emit telemetry to loupe; while debugging *their* agent in *their* repo, their coding agent uses this skill to ask loupe "what did my last run do / why did it fail." The skill is a **product surface loupe ships to its users**, installed into a *foreign* repo — not an in-tree dev tool like `probe`. (Authored in this repo; consumed elsewhere.)

The skill carries **no logic** — all reasoning stays in the agent. It's a map: the endpoint list, how to compose them, and the paste-a-link entry. Sibling skills (`probe`, `openobserve`) need Python for auth + SQL; this one talks to a JSON API, so it's **prose + curl, no script**.

- Triggers on `/loupe` and on pasted loupe URLs (`<loupe-host>/traces/<id>`, `/sessions/<id>`).
- **The loupe base URL is config, not a constant.** It can't assume `localhost:3000` or that the cwd is the loupe repo — loupe runs *somewhere else* relative to the consumer app. Resolve from `LOUPE_BASE_URL` (env), else the origin of a pasted link, else default `http://localhost:3000`. Most devs run loupe locally beside their app (same-machine, no auth holds); a shared/hosted loupe is the remote case below.
- Teaches the search-then-drill loop: list → pick → `GET /api/traces/:id` (or `/conversation`) → `/api/traces/:id/spans/:spanId` for the zoom. `?detail=full` when truncation hides the answer.
- Ships *after* at least the `GET /api/traces/:id` + `/conversation` data primitives land — the brief alone isn't enough to demo the "agent thinks" flow.

### Format: the open Agent Skills standard (researched 2026-06-26)

Build to the open [Agent Skills](https://agentskills.io) format — Anthropic-originated, now supported across the ecosystem (Claude Code, Cursor, Gemini CLI, Copilot, Codex, Goose, OpenCode, Amp, …), so one skill is portable, **not Claude-Code-only**.

- **Layout:** a folder with `SKILL.md` (required frontmatter: `name`, `description` minimum) plus optional `references/`, `scripts/`, `assets/`. Same convention the other `.agents/skills/*` already follow.
- **Progressive disclosure (3 stages):** agents load only `name` + `description` at startup, the full `SKILL.md` on activation, and reference files on demand. So **keep `SKILL.md` tiny** — trigger + the compose loop only — and push the full endpoint table into `references/endpoints.md` loaded when needed (mirror `docs/reference/http-api.md`). A fat `description` is what makes triggering reliable; spend words there (the paste-a-link + debug-shaped cues), not in the body.
- **Portability:** plain `curl` (every agent can shell out), no Claude-specific syntax, never hardcode the port. That keeps it runnable from any skills-compatible client.
- **No MCP.** MCP's own guidance routes local-service access toward MCPB bundles; we deliberately pick skill + localhost HTTP over that (consistent with the Not-in-v1 stance).

### Distribution & sharing

The skill is **authored here, consumed elsewhere** — so it must be installable *standalone* into any app's repo, not coupled to having the loupe source tree. It's self-contained (`SKILL.md` + `references/`, no loupe imports), and it targets a loupe *instance* (a URL), not loupe-the-codebase. Three install paths, in order of friction:

- **Claude Code plugin / marketplace** — `/plugin marketplace add <loupe-org/loupe-skills> && /plugin install loupe`. The primary share path for outside users.
- **Drop-in** — copy the `SKILL.md` + `references/` folder into the consumer app's `.claude/skills/` (or any skills-compatible agent's location). Portable because it's plain curl + the open Agent Skills format.
- **In-tree (this repo only)** — symlinked into `.claude/skills/loupe` like the siblings, for dogfooding loupe against its own MAF sandbox.

Prerequisite to document up front: **a reachable loupe instance with the HTTP API** (local `http://localhost:3000` by default, or `LOUPE_BASE_URL` for a shared one) — not "clone loupe."

**Remote/hosted loupe reopens auth.** The localhost-no-auth v1 covers "dev runs loupe locally beside their app." The moment the skill points at a shared loupe (team dashboard), the API needs auth + non-localhost binding — explicitly out of v1 scope (see Not in v1), but the skill's URL-as-config design is what makes that upgrade additive later. Version the skill alongside the API so the map never drifts from the endpoints.

## Not in v1

- Auth, tokens, CORS, remote access.
- Writes — annotations, tags, comments, re-runs.
- Free-text search across all traces (see Open).
- Streaming / SSE for live runs (covered by live-ingest plan).
- Rate limiting (localhost, single user — irrelevant).
- The skill itself — separate ship after the API lands.
- MCP. Stays off the table. If a future LLM tool can't shell out or fetch, we'll revisit, but the HTTP API stays the canonical surface.
