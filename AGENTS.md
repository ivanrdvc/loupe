# loupe

`TODO.md` is the running todo list. `docs/README.md` covers docs structure. **What attrs to emit / what loupe reads**: `docs/explanation/02-spec.md` is the canonical operating-set spec.

## Layout

- `src/routes/` — file-based routes; `-name.tsx` files are route-scoped. Co-locate; lift to `src/lib/` or `src/components/` only when a 2nd route consumes it.
- `src/components/ui/` shadcn primitives (radix-mira preset). `src/components/` app-specific composed.
- `src/lib/` cross-cutting client utils + shared domain types. `src/server/` server-only. `src/db/` Drizzle. `src/integrations/` framework wiring.

## Map

- App shell: `src/routes/__root.tsx` mounts `AppSidebar` + the `Session`/`Trace` drawer mounts (controlled by `?session=` / `?trace=` URL params, so any page can open either drawer). Individual pages mount their own `SiteHeader`.
- `/sessions` and `/traces` lists open `InspectDrawer` via URL params; `/sessions/$sessionId` and `/traces/$traceId` are the full-page versions for permalink/cold-open. Both pages and both drawers share the same inner view components — edit those, not the shells.
- `/traces` has two tabs: Traces (end-to-end runs; utility traces filtered out) and Spans (`?tab=spans`, lazy-fetched) listing utility purpose-attr spans + sub-agent invocations (`invoke_agent` under `execute_tool`). When the inspector is open, cmd+k narrows to spans in that session (`exclusive` provider in `use-span-search.tsx`).
- Inspect drawer (`src/components/inspect/`, shared by sessions + traces): `drawer.tsx` Sheet shell · `overview.tsx` `InspectLayout` Spans-tab layout + inspector tabs · `tree.tsx` left pane (tree, palette) · `detail-panel.tsx` right pane (messages, tool calls, Make-prompt) · `context.tsx` Context-tab UI backed by pure `context-collectors.ts` · `context-segments.ts` stacked-bar math · `view-bar.tsx` `InspectViewBar`. Per-entity hosts that bind the right query live next to each route: `src/routes/sessions/-components/sessions-drawer-host.tsx`, `src/routes/traces/-components/trace-drawer-host.tsx`. Keep pure helpers in `.ts` siblings so tests don't pull `src/db` via React imports.
- Span/domain helpers: `src/lib/spans.ts`. Formatting: `src/lib/format.ts`.
- Ingest: `src/lib/classify-span.ts` (OTel bag → typed `Classification`); deep dive at `docs/explanation/03-classify-span.md`. Provider clients in `src/lib/telemetry/` — no local mirror DB. Attribute reference: `docs/reference/ai-attributes.md` (full OTel catalog). Convention spec (curated subset loupe reads + stamps, including `gen_ai.task.*` and `tag.tags`): `docs/explanation/02-spec.md`.
