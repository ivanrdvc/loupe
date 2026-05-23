# agentops

`TODO.md` is the running todo list. `docs/README.md` covers docs structure.

## Layout

- `src/routes/` — file-based routes; `-name.tsx` files are route-scoped. Co-locate; lift to `src/lib/` or `src/components/` only when a 2nd route consumes it.
- `src/components/ui/` shadcn primitives (radix-mira preset). `src/components/` app-specific composed.
- `src/lib/` cross-cutting client utils + shared domain types. `src/server/` server-only. `src/db/` Drizzle. `src/integrations/` framework wiring.

## Map

- App shell: `src/routes/__root.tsx` mounts `AppSidebar` + `SiteHeader`. Routes wrap their body in `Page`.
- `/sessions` list + `SessionInspectDrawer`; `/sessions/$sessionId` is the full-page version. Both share view components — edit those, not the shells.
- `/traces` has two tabs: Traces (end-to-end runs; utility traces filtered out) and Spans (`?tab=spans`, lazy-fetched) listing utility purpose-attr spans + sub-agent invocations (`invoke_agent` under `execute_tool`).
- Session drawer (`src/routes/sessions/-components/session-inspect/`): `drawer.tsx` shell · `overview.tsx` Spans-tab layout + inspector tabs · `tree.tsx` left pane (tree, palette) · `detail-panel.tsx` right pane (messages, tool calls, Make-prompt) · `context.tsx` Context-tab UI backed by pure `context-collectors.ts` · `context-segments.ts` stacked-bar math. Keep pure helpers in `.ts` siblings so tests don't pull `src/db` via React imports.
- Span/domain helpers: `src/lib/spans.ts`. Formatting: `src/lib/format.ts`.
- Ingest: `src/lib/classify-span.ts` (OTel bag → typed `Classification`). Provider clients in `src/lib/telemetry/` — no local mirror DB. Attribute reference: `docs/reference/ai-attributes.md`.
