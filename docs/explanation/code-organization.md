---
title: Code organization
type: explanation
summary: Three tiers — routes (thin), feature slices (src/features), shared kernel (src/lib). Who may import what, and when code moves between tiers.
status: current
owner: Ivan
audience: engineers
last-reviewed: 2026-06-12
tags: [tanstack-start, react-query, organization, vertical-slices]
---

# Code organization

Code is sorted by *who depends on it*, not by what shape it has. Three tiers:

- **`src/routes/`** — thin route files only. They exist here (not in the slice) because TanStack Start scans only `src/routes`. `-`-prefixed files (`-data.ts`, `-components/`) are route-scoped and excluded from the route tree (`routeFileIgnorePrefix`).
- **`src/features/<name>/`** — vertical slices: a bounded context's components, pure logic, and server code in one folder (`evaluation`, `inspect`, `inventory`, `notes`, `inbox`, `tasks`, `mcp`). Evaluation = scores + evals + datasets (one bounded context). Inspect is shared by the sessions and traces routes and both drawers.
- **`src/lib/`** — the shared kernel: pure, framework-free domain plus provider clients. `spans/` (Span type, classify-span, conversation), `eval/` (scoring kernel: `evaluation.ts` only), `telemetry/` (OpenObserve / App Insights clients — no local mirror DB), `tools/`, `alerts/`, and util files (`format`, `json`, `time-range`, `tone`, `query-keys`, `utils`). Nothing here imports React, `src/db`, or a slice.

Plus the supporting cast: **`src/db/`** (drizzle schema + client), **`src/hooks/`** (app-shell hooks only — `use-user`, `use-time-range`, `use-auto-refresh`, `use-mobile`, … ; feature hooks live in their slice, e.g. `use-breakdowns` is in inspect), **`src/components/`** (app shell + composed components; `ui/` is shadcn primitives).

There is no `src/server/` anymore. Server code lives in the slice that owns it (`features/<name>/server.ts` or `server/`); `detection` lives in `features/inventory/detection`.

## Slice anatomy

```
src/features/evaluation/
  index.ts          barrel — the public surface other slices and the app shell import
  components/       React UI
  logic/            pure .ts helpers — no React, no db imports
  server/           server fns + db/telemetry access
  dataset-types.ts  shared domain types
```

Smaller slices flatten this (`inbox/` is just `index.ts`, `queries.ts`, `meta.ts`, `server.ts`).

Why `logic/` is separate: unit tests deep-import `logic/` files directly so they don't pull React or `src/db` through a barrel.

Strippability rule for server files: a module a *client route* imports must export only server fns (`createServerFn`) and types — anything else (e.g. a top-level `import { db }`) executes in the browser and crashes. Plain server-only helpers go in a separate file the client never imports (e.g. `evaluation/server/eval-jobs.ts` vs `evals.ts`).

## Import rules

- **Owning routes deep-import their slice freely.** `/evals` routes import `#/features/evaluation/server/evals`, `#/features/evaluation/components/...` directly.
- **Everyone else goes through the barrel.** Another slice, the app shell, or an unrelated route imports only `#/features/<name>` (e.g. the notification bell reads `inboxUnreadCountQuery` from `#/features/inbox`).
- **App-shell consumers must not import route-scoped `-data.ts` files.** Queries a shell component needs live in the owning slice, or — when no slice exists — next to the component (`src/components/settings-data.ts`) or in `src/lib/` (`session-queries.ts` for the sidebar/root drawer).
- **`src/lib/` imports nothing above it.** Slices and routes import lib, never the reverse.

## Where new code goes

1. **Start route-scoped.** A component or query used by one route lives in that route's `-components/` / `-data.ts`.
2. **Lift to the slice when a second consumer appears** — another route, a drawer, the app shell. The lift target is the feature slice, *not* `src/lib`.
3. **Lift to `src/lib/` only if it's pure domain shared across slices** (or a provider client). If it imports React or `src/db`, it doesn't belong there.

## Example: a new `/agents` feature

```
src/routes/agents/
  index.tsx                  route
  -data.ts                   server fn + queryOptions glue
src/features/agents/
  index.ts                   barrel
  server.ts                  drizzle reads, server fns
src/lib/query-keys.ts        add `agents: { all: () => ['agents'] as const }`
```

`-data.ts`:

```ts
import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { queryKeys, STALE_TELEMETRY_MS } from '#/lib/query-keys'
import { listAgents } from '#/features/agents/server'

const fetchAgents = createServerFn({ method: 'GET' }).handler(() => listAgents())

export const agentsQuery = () =>
  queryOptions({ queryKey: queryKeys.agents.all(), queryFn: fetchAgents, staleTime: STALE_TELEMETRY_MS })
```
