---
title: MCP read-through registry
type: explanation
summary: How loupe reads MCP registry references, fetches live server capabilities, and keeps SQLite limited to local app state.
status: current
owner: Ivan
audience: engineers
last-reviewed: 2026-05-13
tags: [mcp, registry, telemetry, sqlite]
---

# MCP read-through registry

`/mcp` is a live registry view, not a SQLite mirror.

The remote registry only gives loupe references to MCP servers. A reference
is enough to know that a server exists and how to reach it, but it is not the
tool catalog. To render tool quality, counts, descriptions, and schemas,
loupe must call each referenced MCP server and ask for its live capabilities.

## Ownership boundaries

Three systems own different data:

- **Remote registry / Azure Table** owns server references: server name,
  endpoint, transport, source metadata, and maybe owner metadata.
- **MCP servers** own live capabilities: tools, descriptions, input schemas,
  and whatever else `tools/list` returns.
- **SQLite** owns loupe-local state: observed telemetry inventory, inbox
  alerts, user dismissals/snoozes, and discovery cursors.

Do not store `mcp_servers` or `mcp_tools` as canonical SQLite tables in v1.
That would duplicate remote state without solving the actual problem: the tool
catalog still has to come from each MCP server.

## Request flow

The `/mcp` query does this:

1. Read server references from the configured registry source.
2. For each reference with an endpoint, call the MCP server for `tools/list`.
3. Normalize every result into app-level `McpServer` and `McpTool` types.
4. Mark per-server failures as `fetchStatus: 'error'`.
5. Run lint rules over the normalized result.
6. Return the result to the route through a TanStack Query server function.

Failure is partial by design. If one MCP server is down, `/mcp` still shows the
others and marks the failed row explicitly.

## Current implementation

The code lives under `src/lib/mcp/`:

- `types.ts` defines `RegistrySource`, `McpServerRef`, `McpServer`,
  `McpTool`, and `McpRegistryResult`.
- `registry.ts` currently reads `MCP_REGISTRY_REFS_JSON`. Replace this adapter
  with the Azure Table implementation once the table shape is known.
- `client.ts` calls MCP servers with JSON-RPC `tools/list`.
- `index.ts` orchestrates registry refs, bounded capability fetches, and
  partial failure collection.
- `lint.ts` runs in-memory quality checks.

The first UI route is `src/routes/mcp/index.tsx`.

## SQLite role

SQLite stores local state only:

- `inventory` for telemetry-observed things such as `mcp_tool`, `mcp_server`,
  `agent`, and `model`.
- `inbox_item` for fired alerts and user state.
- `alert_rule` for local alert thresholds.
- `discovery_cursor` for detection progress.

`inventory` is usage-derived. It can say "tool X was observed in telemetry",
but it is not a registry table and should not be treated as the declared MCP
catalog.

## When to add a cache

Add a SQLite cache only after live reads are measured to be too slow or flaky.
If added, model it explicitly as cache state:

```txt
mcp_registry_cache
  source
  server_name
  fetched_at
  payload_json
  error_json
```

The cache should have refresh/TTL semantics. It should not become the source of
truth for MCP servers or tools.

## Next work

Implement the Azure Table registry adapter once the reference row shape is
known. After that, add detail routes for server and tool pages, then join live
registry data with telemetry-derived `inventory` to show observed usage.
