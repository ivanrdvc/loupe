---
title: Code organization
type: explanation
summary: Where each kind of module lives. Lib stays pure; routes own their data via `-data.ts`; React hooks, DB code, and server-only logic each have a home.
status: current
owner: Ivan
audience: engineers
last-reviewed: 2026-05-13
tags: [tanstack-start, react-query, organization]
---

# Code organization

Code is sorted by *who depends on it*, not by what shape it has:

- **`src/lib/`** — pure, framework-free domain (`spans`, `classify-span`, `conversation`, `tokens`, `format`, `json`) plus shared infra (`query-keys`, `telemetry/`).
- **`src/features/`** — feature folders that bundle a domain's logic, server fns, and components together (`evaluation`, `inspect`, `inventory`, `notes`, `inbox`, `tasks`, `mcp`).
- **`src/hooks/`** — React hooks (`use-user`, `use-time-range`, `use-auto-refresh`, `use-breakdowns`, `use-mobile`). Theme is handled by `next-themes`, not a local hook.
- **`src/server/`** — server-only modules that touch the local DB (`detection`, `agent-run`, `breakdowns`). Telemetry ingest is a route handler (`src/routes/api/evals/ingest.ts`), not a `src/server` module.
- **`src/db/`** — drizzle schema and client.
- **`src/routes/<feature>/-data.ts`** — server fns + `queryOptions` colocated with the route that owns them. The `-` prefix excludes the file from TanStack Router's route tree (`routeFileIgnorePrefix`, default `-`).

Rule: a `-data.ts` file is the only thing routes import for fetching. It glues `src/server/*` or `src/lib/telemetry` to React Query — nothing else does.

## Example: a new `/agents` feature

```
src/routes/agents/
  index.tsx       route
  -data.ts        server fn + queryOptions
src/server/
  agents.ts       drizzle reads, no React, no server-fn wrapper
src/lib/
  query-keys.ts   add `agents: { all: () => ['agents'] as const }`
```

`-data.ts`:

```ts
import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { queryKeys, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import { listAgents } from '#/server/agents'

const fetchAgents = createServerFn({ method: 'GET' }).handler(() => listAgents())

export const agentsQuery = () =>
  queryOptions({ queryKey: queryKeys.agents.all(), queryFn: fetchAgents, staleTime: STALE_TELEMETRY_MS })
```

App-shell consumers must not import route-scoped `-data.ts` files. Queries a shell component needs live in the owning feature slice (e.g. the header notification bell reads `inboxUnreadCountQuery` from the `#/features/inbox` barrel; the inbox route deep-imports `#/features/inbox/queries`) or, when no slice exists, in `src/lib/` (e.g. `session-queries.ts` for the sidebar/root drawer, `providers-data.ts` for the settings dialog).
