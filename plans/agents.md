# TODO — Agents

`/mcp` (see `mcp.md`) covers the *supply* side: what MCP servers exist, who owns them, what tools they expose. This plan covers the *demand* side: what agents we run, what they're configured with, what tools they actually have attached. These are two orthogonal axes — joining them on tool name is what makes either of them useful.

Pulled from Microsoft Agent Framework's DevUI `/v1/entities` endpoint; other frameworks can plug in later via the same `AgentSource` interface.

## Why this is separate from MCP

A single tool name `get_employee` can be in three different states:

| In MCP registry? | Attached to an agent? | Meaning |
|---|---|---|
| ✓ | ✓ | Healthy — registered tool, actually wired up. Full lint coverage. |
| ✓ | ✗ | Dead inventory — tool exists, no consumer. |
| ✗ | ✓ | Either a non-MCP built-in (C#/Python local function) or an MCP server that escaped the registry. |

The MCP registry can't see column 2; only an agent inventory can. The agent inventory can't see column 1 alone; only the MCP registry can. Need both.

## Decided

- **Two registries, joined on read.** Separate interfaces, separate sources, separate top-level routes. Joined by tool name in queries and lint, not at ingestion time.
- **First source: DevUI.** GET `${baseUrl}/v1/entities` returns the inventory we need. Mirrors the `TelemetryProvider` pattern in `src/lib/telemetry/types.ts`.
- **Pull cadence.** Same scheduler tick as MCP sync — 5–15 min + manual refresh button.
- **No full snapshots.** `first_seen` / `last_seen` per `agents` and `agent_tools` row gives the diff. Same trick as `mcp.md`.
- **Tool join is name-only, lossy by design.** DevUI flattens tools into a single namespace per agent with no provenance. Orphans on either side are valid lint findings, not bugs.

## Open

- **Tool provenance.** DevUI says "agent has tool `get_employee`" but not "from server `employee-mcp`." Two ways to fix:
  - Convention: every MCP server name-prefixes its tools (`employee.get_employee`).
  - Instrumentation: tool-call spans emit `mcp.server.name`.

  v1 ships without provenance — names alone — and lints `tool.unresolved` when an attached name doesn't match any registered MCP tool. Provenance follow-up tracked alongside the MCP attribute mapping in `mcp.md` § Open.

- **Stale agents.** A long-running agent that gets restarted shows up fine. An agent service that goes down for a week is invisible to polling. Surface "not seen in N days" as a warning; never auto-delete.

- **Multi-tenant endpoints.** One DevUI URL can host many entities (the `entities` array supports it). Already handled by the schema; config is `{label, url}` pairs, not bare URLs, so the UI can show friendly names.

- **Workflows vs agents.** `/v1/entities` returns both. Each workflow has a non-empty `executors` field (nested nodes). v1 ingests them as agents (single `agents` row, type discriminator); rendering the executor tree is a follow-up.

- **OTel-derived agents (future).** Every distinct `gen_ai.agent.name` that appears as a top-level `invoke_agent` (no `gen_ai.task.parent.id`) is an agent — loupe can derive a second inventory from telemetry alone, alongside DevUI. Especially useful for non-MEAI frameworks. `gen_ai.task.parent.id` (per [`../docs/explanation/02-spec.md`](../docs/explanation/02-spec.md)) also gives sub-agent linkage without manual lint rules.

## Source interface

`src/lib/agents/types.ts`:

```ts
export interface AgentSource {
  name: string                                // 'devui', 'k8s-discovery', ...
  pull(): Promise<RegistryAgent[]>
}

export interface RegistryAgent {
  id: string                  // entity.id, e.g. 'ProverbsAgent'
  type: 'agent' | 'workflow'
  framework: string           // 'agent_framework'
  modelId?: string            // 'gpt-4o-mini'
  providerName?: string       // 'openai'
  providerUri?: string        // base URL of the model provider
  systemPrompt?: string       // entity.description
  attachedToolNames: string[] // flat list, names only
  sourceUrl: string           // DevUI base URL this agent was scraped from
  raw?: unknown               // keep the original entity JSON for forward-compat
}
```

Symmetric with `McpServerSource` (planned in `mcp.md`) — neither extends the other; they share only the "thing-that-gets-pulled-on-a-schedule" contract, which is too thin to factor out.

## Data model

Additions to `src/db/schema.ts` (sqlite):

```
agents
  id            text pk      -- composite-ish: '{sourceUrl}#{entityId}' to allow same name across services
  entity_id     text         -- the raw entity.id
  type          text         -- 'agent' | 'workflow'
  framework     text
  model_id      text nullable
  provider_name text nullable
  provider_uri  text nullable
  system_prompt text nullable
  source_url    text         -- DevUI base URL
  source        text         -- 'devui', for future-proofing
  first_seen    integer
  last_seen     integer

agent_tools
  agent_id      text fk -> agents.id
  tool_name     text         -- no FK to mcp_tools; join by name at read time
  first_seen    integer
  last_seen     integer
  pk(agent_id, tool_name)
```

Idempotency key: `(source, source_url, entity_id)`.

## Sync (`src/server/agent-sync.ts`)

Mirrors `src/server/mcp-sync.ts` in shape:

1. For each configured `AgentSource`, call `pull()`.
2. Upsert into `agents` and `agent_tools`, bumping `last_seen`.
3. Done. The read-time join with `mcp_tools` runs in queries, not here.

Configured via env:

```
AGENT_SOURCES_DEVUI=http://localhost:8080,https://agent-prod.acme.test
```

## UI

- **`/agents`** *(new top-level)* — one row per agent: name, framework, model, provider, attached tool count, lint count, last seen. Catalyst table.
- **`/agents/$id`** — detail. System prompt (collapsible), tool list cross-linked to `/mcp/tools/$toolId` where the name matches; "unresolved" badge otherwise. Workflow executors render as a tree (deferred — v1 shows a flat list with a note).
- **`/agents/changes`** — added/removed agents and tool-attachments in the last 7/30 days. Sibling of `/mcp/changes`.
- **`/mcp/tools/$toolId`** — gains an "Attached to" section listing the agents that have this tool (sourced from `agent_tools` by name match).
- **`/runs/$runId.tsx`** — when `service.name` on the trace matches an `agents.entity_id`, add a "View agent" link in the run header.

## Lint rules (`src/lib/agents/rules/`)

Runs from DevUI data alone; no MCP-registry dependency.

- **`toolbox.ts`** — `attachedToolNames.length > 30` warns, `> 50` errors. Same thresholds as `mcp/rules/count.ts`, applied per agent.
- **`prompt.ts`** — empty or very short `systemPrompt` (< 50 chars). "no data" if the field is missing.
- **`model.ts`** — known-deprecated model id list as a constant; flag any agent on it.
- **`provider.ts`** — `providerUri` not on an allowlist (e.g. unexpected Azure preview endpoint).
- **`unresolved.ts`** — an attached tool name that doesn't appear in `mcp_tools`. Could be a legitimate built-in; surface as info, not error.

Each rule returns `{ severity, rule_id, message, evidence }`, same contract as `mcp/rules/*`.

## DevUI surface — what else is there

The agent test repo (`agent-run-test/agent/Program.cs:84`) mounts DevUI via `app.MapDevUI()` plus `MapOpenAIResponses()` / `MapOpenAIConversations()`. Full surface from probing:

| Endpoint | Method | What it gives |
|---|---|---|
| `/v1/entities` | GET | Agent/workflow inventory. Used here. |
| `/v1/responses` | POST | OpenAI-compatible Responses API. *Runs* the agent. Not in v1, but enables "send a test ping" from loupe. |
| `/v1/conversations` | GET/POST | OpenAI Conversations API. Thread state. Useful if we later want to mirror DevUI's chat UI inside loupe. |
| `/devui/` | GET | The DevUI SPA itself. Linked from `/agents/$id` as an external link in v1. |
| `/health` | GET | Liveness. Used for `/agents` "last seen" sanity-check. |

There is no OpenAPI / Swagger spec, no per-entity detail endpoint (`/v1/entities/{id}` 404s), no run-history endpoint. For runs and tokens we keep using OTel.

## Build

- [ ] `src/lib/agents/` — `types.ts`, `index.ts`, `devui.ts`, `lint.ts`, `rules/*.ts`.
- [ ] DB tables + migration for `agents`, `agent_tools`.
- [ ] `src/server/agent-sync.ts` — pull + upsert + diff. Scheduled.
- [ ] Routes: `src/routes/agents/index.tsx`, `$id.tsx`, `changes.tsx`.
- [ ] "Attached to" section on `/mcp/tools/$toolId`.
- [ ] "View agent" link on `/runs/$runId.tsx` when `service.name` resolves.
- [ ] Manual refresh button on `/agents` → POST to `agent-sync`, revalidate.

## Not in v1

- Running agents from loupe (`POST /v1/responses` ping).
- Conversation/thread mirroring.
- Executor tree rendering for workflows.
- Tool provenance — which MCP server an attached tool came from.
- Auth on DevUI endpoints (assumes reachable internal network, same posture as the OTel collectors in `src/lib/telemetry/`).
- Non-DevUI agent sources (k8s discovery, LangSmith, etc.) — interface is ready; impls are later.
