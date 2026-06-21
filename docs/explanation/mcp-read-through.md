---
title: MCP read-through registry
type: explanation
summary: How loupe reads MCP registry references, fetches live server capabilities over the MCP SDK, derives cost/scale signals, lints them via config-tunable rules-as-data, and keeps SQLite limited to local app state.
status: current
owner: Ivan
audience: engineers
last-reviewed: 2026-06-21
tags: [mcp, registry, telemetry, sqlite, lint, cost]
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
  problem (the catalog still has to come from each server). MCP adds **no**
  table: manual tool tags are code, not DB (see [Signals & tags](#signals--tags)).

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
- `index.ts` — `listMcpRegistryWithLint` (fetch + lint, reading lint config from
  env) and the slice barrel.
- `lint.ts` — `BUILTIN_RULES` (rules-as-data) + `lintMcpRegistry(servers, {
  config, rules })`. See [Lint](#lint).
- `lint-config.ts` — `LINT_CONFIG`, a code-declared map of per-rule overrides.
- `logic/signals.ts` — `deriveSignals(tool)`: cost/scale flags derived purely
  from a tool's name + input schema. See [Signals & tags](#signals--tags).
- `tool-tags.ts` — `TOOL_TAGS`, a code-declared map of manual labels keyed by
  tool id. Empty in core; a fork populates it for its registry.
- `logic/aggregate-tools.ts` — collapses tools to a unique set across servers
  and flags duplicates / conflicts (same name, divergent description or schema).
- `logic/lint-helpers.ts` — group findings by category, severity ordering.

Routes live in `src/routes/mcp/` (one query, derived three ways):

- `index.tsx` — `/mcp` with `Tabs`: **Servers** (data-table), **Tools**
  (browser grouped by server, detail pane shows signals + tags, faceted chip
  filter over signals ∪ tags), **Lint** (findings grouped by category).
- `$serverId.tsx` — server detail: metadata + server-level lint.

## Reused components

The Tools detail pane renders a tool's input schema with
`JsonBlock` / `PanelSection` from `src/components/ai-elements/json-block.tsx` —
a labeled section with a raw↔formatted JSON toggle and copy, **shared with the
span inspector's detail panel** rather than duplicated.

## Signals & tags

Two ways to annotate a tool, both surfaced in the Tools browser and usable as
filter facets:

- **Signals** are *derived*, never stored. `deriveSignals(tool)` reads the
  tool's name + input schema and returns any of `paginated`, `unbounded`,
  `bulk`, `self-scoped`, `filterable`. They exist to anticipate which tools
  won't scale as the org grows: `unbounded` (a list/search tool that takes no
  pagination *or* filter param, so its output grows with the data) is the cost
  signal — `get_all_employees` blows up agent context, `get_my_reports` doesn't.
  `self-scoped` suppresses `unbounded` even when `bulk` also matches. The
  keyword/param sets live in `signals.ts` and are *not* config-tunable (changing
  them is code).
- **Tags** are *manual* labels, declared in code (`TOOL_TAGS` in `tool-tags.ts`,
  keyed by tool id). Curation that isn't derivable like a signal, but small and
  fork-specific enough that it doesn't earn a DB table — a committed map is
  reviewable and versioned. Read-only in the UI; edit the map to change them.

## Lint

`lintMcpRegistry(servers, { config, rules })` returns `{ severity, category,
ruleId, message, evidence }` findings over what `tools/list` gives us (no
telemetry, no DB). Categories: `server-health` (fetch failure, tool count),
`cost` (`tool.unbounded`, off the signals above), `tool-catalog`
(missing/over-long descriptions, empty schema, undocumented params), and
`naming` (name shape, mixed case, missing service prefix, ambiguous param
names, cross-server duplicate names). Messages are actionable — they tell the
owner what to change.

**Rules are data.** Each rule is a `LintRule` — `{ id, category, defaultOptions,
run(servers, options) }` — and `BUILTIN_RULES` is just an array of them. The
runner walks the array, applies per-rule config, and concatenates findings.

**Config tunes; code adds.** Two distinct levers, deliberately:

- *Tune* a built-in (or extension) rule via `LINT_CONFIG` (`lint-config.ts`) —
  `{ rules: { "<ruleId>": { enabled?, severity?, options? } } }`. Disable it,
  change its severity, or adjust its thresholds (e.g. `server.tool_count`
  warn/error). It's code, not env: a ruleset is a project property, reviewed and
  versioned — empty in core, a fork edits this one file.
- *Add* a genuinely new rule by appending a `LintRule` to the `rules` array —
  also code. A fork passes `[...BUILTIN_RULES, ...extraRules]`; the `rules` param
  **is** the extension seam (loupe core ships no `src/extensions/`). There is no
  declarative rule-authoring in config — serializing rule logic into JSON would
  mean `eval`-ing user code.
