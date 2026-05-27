# TODO — MCP

The AI team can't review every tool every non-AI team adds. With ~300 tools across a dozen servers, things that quietly degrade agents — 5 MB JSON responses, 60-tool servers, empty descriptions, prefix clashes — ship without anyone in AI noticing.

`/mcp` mirrors the MCP registry, joins it with the OTel telemetry we already collect, and flags problems. Read-only — awareness, not approval gates.

This is the *supply side* — what MCP servers exist. Its sibling `agents.md` covers the *demand side* — what agents are configured with which tools. Two registries, joined on tool name when needed.

## How it works

- Pull the registry on a schedule into our DB (`mcp_servers`, `mcp_tools`).
- Track `first_seen` / `last_seen` per server and per tool. That's our change history; no full snapshots needed.
- Compute response-size stats from tool-call spans at view time — no extra storage.
- Run lint rules over the joined data. Surface findings inline, on `/mcp/changes`, and on `/mcp/lint`.

## Decided

- **Source abstraction.** `RegistrySource` interface in `src/lib/mcp/types.ts`, one impl per source. First impl reads the Azure table we use today; nothing outside `azure-table.ts` knows the source.
- **Pull cadence.** Scheduled refresh every 5–15 min + a manual "Refresh" button.
- **Snapshot retention.** None. `first_seen` / `last_seen` is enough for "added this week."
- **Runtime health is out of v1.** Error rates, p95 latency, unused-tool detection are a follow-up.
- **Owner attribution.** Source probably carries an owner field; if missing, that's a lint finding ("server with no owner").

## Open

- **Which span attributes carry MCP data?** OTel GenAI hasn't standardized MCP yet. Best current guesses:
  - tool name: `gen_ai.tool.name` (OTel GenAI) or `mcp.tool.name` (varies by SDK).
  - server name: not standard — likely `mcp.server.name` or buried in `gen_ai.tool.message` event metadata.
  - response size: no standard. Options: measure `content` length on the `gen_ai.tool.message` event, or have the agent SDK emit `mcp.response.size_bytes`.

  Settle one mapping per telemetry provider and centralize in `src/lib/mcp/attributes.ts`. When an attribute is missing, lint reports "no data" not "OK."

- **Tool count: attached vs used.** Two different signals.
  - *Attached* — what the agent could call. The number that actually matters for context bloat. Source unclear; may need extra instrumentation.
  - *Used* — what the agent did call. Easy to compute from spans, but a different lint ("60 attached, 4 used").

  v1: lint on attached if we can get it; else lint on used and label it as such.

## Data model

- `mcp_servers` — id, name, transport, endpoint, owner_team, owner_contact, first_seen, last_seen, source.
- `mcp_tools` — id, server_id, name, description, input_schema_json, first_seen, last_seen.
- Idempotency key: `(source, server.name, tool.name)`.

## UI

- `/mcp` — overview. One row per server: name, owner, tool count, lint count, last refreshed.
- `/mcp/$serverId` — server detail. Tools list with lint badges.
- `/mcp/tools/$toolId` — tool detail. Schema, description, p50/p95 response size, runs that called it.
- `/mcp/changes` — what was added, removed, or modified in the last 7/30 days. The early-warning view — its own page, not a filter chip.
- `/mcp/lint` — flat list of findings, sortable by severity / server / rule.

Catalyst tables throughout. Cross-link a run's tool-call span to `/mcp/tools/$toolId` and back.

## Lint rules

Each rule returns `{ severity, rule_id, message, evidence }`. One file per family in `src/lib/mcp/rules/`. Plain functions over `{ server, tool?, stats? }`.

- **size.ts** — p95 response > 50 KB warns, > 200 KB errors. Reports "no data" when the attribute is missing.
- **count.ts** — server with > 30 tools warns, > 50 errors. Same thresholds applied to per-agent toolbox (attached if available, else used, labeled).
- **naming.ts** —
  - name 3–40 chars, no whitespace
  - mixed snake_case / camelCase within one server
  - prefix collisions across servers attached to the same agent
  - description 20–500 chars
  - input schema non-trivial (not `{}`)
  - server has owner

Thresholds are constants in `lint.ts`. Tune later.

## Build

- [ ] `src/lib/mcp/` — `types.ts`, `index.ts`, `azure-table.ts`, `attributes.ts`, `lint.ts`, `rules/*.ts`.
- [ ] DB tables + migration for `mcp_servers`, `mcp_tools`.
- [ ] `src/server/mcp-sync.ts` — pull + upsert + diff `first_seen` / `last_seen`. Idempotent. Scheduled via existing task runner.
- [ ] `src/server/mcp-payload-stats.ts` — p50/p95 response size per tool across telemetry providers.
- [ ] Routes: `src/routes/mcp/index.tsx`, `$serverId.tsx`, `tools/$toolId.tsx`, `changes.tsx`, `lint.tsx`.
- [ ] Cross-link tool-call spans on `/runs/$runId` to `/mcp/tools/$toolId`.
- [ ] Manual "Refresh" button on `/mcp` → POST to `mcp-sync`, revalidate.

## Not in v1

- Runtime health (errors, latency, unused tools).
- Approving / blocking registrations.
- Editing the registry from loupe.
- Auto-fix for lint findings.
- Slack/email alerting.
- Snapshot-vs-snapshot compare view (could live under `/mcp/changes` later; v1 shows the delta from `first_seen` / `last_seen`).
