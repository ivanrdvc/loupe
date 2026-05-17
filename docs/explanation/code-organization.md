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

- **`src/lib/`** — pure, framework-free domain (`spans`, `classify-span`, `conversation`, `tokens`, `format`, `json`) plus shared infra (`query-keys`, `telemetry/`, `mcp/`).
- **`src/hooks/`** — React hooks (`use-user`, `use-env`, `use-time-range`, `use-auto-refresh`, `use-breakdowns`, `use-mobile`, `use-session-note`). Theme is handled by `next-themes`, not a local hook.
- **`src/server/`** — server-only modules that touch the local DB (`inbox`, `detection`, `ingest`).
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

Cross-feature consumers (e.g. the global sidebar reading `inboxUnreadCountQuery` from `routes/inbox/-data`) import the route's `-data.ts` directly. Truly app-wide queries that don't belong to a route (e.g. `providers-data.ts` for the settings dialog) live in `src/lib/`.
