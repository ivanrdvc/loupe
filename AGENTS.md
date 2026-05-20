# agentops

"TODO" means the root `TODO.md` — read it, append entries there when relevant.

For docs structure and where to put new ones, see `docs/README.md`.

## Layout

- `src/routes/` — file-based routes. `-name.tsx` files are route-scoped and ignored by the router. Co-locate aggressively; lift to `src/lib/` or `src/components/` only when a 2nd route consumes it.
- `src/components/ui/` — shadcn primitives (radix-mira preset, see `components.json`). `src/components/` — app-specific composed components.
- `src/lib/` — cross-cutting client utilities and shared domain types (e.g. `spans.ts`).
- `src/server/` — server-only code: ingest mappers, future API handlers.
- `src/db/` — Drizzle schema + client. `src/integrations/` — framework wiring (tanstack-query).

## Product Map

Optimize for tokens: use this map before broad searches.

- App shell mounts in `src/routes/__root.tsx`: `SidebarProvider` + `AppSidebar` (`src/components/app-sidebar.tsx`) + `SiteHeader` (`src/components/site-header.tsx`). Routes wrap their body in `Page` (`src/components/page.tsx`).
- `/` Home shows "what's new/weird": new MCP tools, new agents, and anomaly entry points.
- `/sessions` lists agent sessions with time range, search, status filters, cost/tokens, and opens `SessionInspectDrawer`.
- `/sessions/$sessionId` is the session detail page (Spans + Conversation). Legacy `?view=trace` in the URL is treated as spans.
- `/traces` lists individual traces + elevated purpose-spans. Session-bound chat traces are hidden by default (toggle to show). Utility purpose-spans (`gen_ai.operation.purpose`) from inside session traces are surfaced as their own rows.
- `/mcp` lists MCP servers, owners, tool counts, findings, and fetch status.
- `/evals` is currently an empty-state placeholder.
- `/inbox` lists alerts with snooze/dismiss actions and links back to sessions and runs.

Key session/run UI:

- `src/routes/sessions/-components/session-inspect/drawer.tsx` — right drawer from `/sessions`; Spans / Conversation / Context tabs.
- `src/routes/sessions/$sessionId.tsx` is the full-page version of the same thing (adds URL state, time range, provider/fingerprint badge).
- Drawer and session page share view components — `./session-inspect/overview.tsx` (Spans), `src/components/conversation-view.tsx`, `./session-inspect/context.tsx`. Edit those, not the shells.
- The span tree (`./session-inspect/tree.tsx`) hides plain `http` transport spans, reparents children upward, aggregates subtree tokens/cost.
- Span/domain helpers: `src/lib/spans.ts`. Shared formatting: `src/lib/format.ts`.

Ingest & attribute parsing:

- `src/lib/classify-span.ts` — turns an OTel attribute bag + span name into a typed `Classification` (operation, model, tokens, tool fields, session id, …). Touch this when adding semconv support.
- `src/lib/telemetry/` — provider clients (OpenObserve, App Insights) that fetch live spans. No local mirror DB.
- Span attribute reference: `docs/reference/ai-attributes.md` — canonical lookup for `gen_ai.*`, Logfire `llm_*`, AG-UI `ag_ui_*`, OpenAI extensions, and the agent-as-tool pattern.
