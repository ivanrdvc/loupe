---
title: MCP read-through registry
type: explanation
summary: How loupe reads MCP registry references, fetches live server capabilities over the MCP SDK, lints them, and keeps SQLite limited to local app state.
status: current
owner: Ivan
audience: engineers
last-reviewed: 2026-06-16
tags: [mcp, registry, telemetry, sqlite]
---

# MCP read-through registry

`/mcp` is a live registry view, not a SQLite mirror.

The registry only gives loupe *references* to MCP servers — enough to know a
server exists and how to reach it, but not its tool catalog. To render tools,
counts, descriptions, and schemas, loupe calls each referenced server and asks
for its live capabilities at query time.

## Ownership boundaries

Three systems own different data:

- **Registry** (env `MCP_REGISTRY_REFS_JSON`) owns server references: id, name,
  endpoint, transport, and optional owner metadata.
- **MCP servers** own live capabilities: tools, titles, descriptions, input
  schemas, and annotations — whatever `tools/list` returns.
- **SQLite** owns loupe-local state only (telemetry-observed inventory, inbox
  alerts, dismissals, discovery cursors). There are no `mcp_servers` /
  `mcp_tools` tables — that would duplicate remote state without solving the
  problem (the catalog still has to come from each server).

## Request flow

The `/mcp` server function does this:

1. Read server references from the registry source.
2. For each reference with an endpoint, connect and call `tools/list`
   (bounded concurrency, per-request timeout).
3. Normalize every result into app-level `McpServer` / `McpTool`.
4. Mark per-server failures as `fetchStatus: 'error'` — failure is partial by
   design; one server being down doesn't blank the page.
5. Lint the normalized result.
6. Return it to the route via a TanStack Query server function.

## Talking to servers

`client.ts` uses the official **`@modelcontextprotocol/sdk`** client
(`Client` + `StreamableHTTPClientTransport`), not a hand-rolled fetch. The SDK
performs the `initialize` handshake, content negotiation, and SSE framing — a
spec-compliant streamable-HTTP server commonly answers `tools/list` as an SSE
stream, which a bare `resp.json()` can't parse. We bound `connect` and
`listTools` with a request timeout and surface any failure as a fetch error.

## Code

Under `src/features/mcp/` (the generic, all-forks core):

- `types.ts` — `RegistrySource`, `McpServerRef`, `McpServer`, `McpTool`
  (incl. `title` / `annotations`), `McpLintFinding`, `LintCategory`.
- `registry.ts` — `EnvRegistrySource` reads `MCP_REGISTRY_REFS_JSON`. A fork
  that needs a private source (Cosmos, Azure Table) patches `getRegistrySource`
  in its own tree; loupe core stays env-only.
- `client.ts` — MCP SDK `listServerTools`.
- `index.ts` — `listMcpRegistryWithLint` (fetch + lint) and the slice barrel.
- `lint.ts` — quality rules; thresholds are constants at the top.
- `logic/aggregate-tools.ts` — collapses tools to a unique set across servers
  and flags duplicates / conflicts (same name, divergent description or schema).
- `logic/lint-helpers.ts` — group findings by category, severity ordering.

Routes live in `src/routes/mcp/` (one query, derived three ways):

- `index.tsx` — `/mcp` with `Tabs`: **Servers** (data-table), **Tools**
  (browser grouped by server, with a detail pane), **Lint** (findings grouped
  by category).
- `$serverId.tsx` — server detail: metadata + server-level lint.

## Reused components

The Tools detail pane renders a tool's input schema with
`JsonBlock` / `PanelSection` from `src/components/ai-elements/json-block.tsx` —
a labeled section with a raw↔formatted JSON toggle and copy, **shared with the
span inspector's detail panel** rather than duplicated.

## Lint

`lintMcpRegistry(servers)` returns `{ severity, category, ruleId, message,
evidence }` findings over what `tools/list` gives us (no telemetry, no DB).
Categories: `server-health` (fetch failure, tool count), `tool-catalog`
(missing/over-long descriptions, empty schema, undocumented params), and
`naming` (name shape, mixed case, missing service prefix, ambiguous param
names, cross-server duplicate names). Messages are actionable — they tell the
owner what to change. Tune thresholds via the constants in `lint.ts`.
