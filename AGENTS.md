# loupe

`TODO.md` is the running todo list. `docs/README.md` covers docs structure. **What attrs to emit / what loupe reads**: `docs/explanation/02-spec.md` is the canonical operating-set spec.

**Comments: sparse.** Only where the *why* isn't obvious from the code. No section dividers, no narration of what a line plainly does.

## Layout

- `src/routes/` — file-based routes; `-name.tsx` files are route-scoped. Co-locate; lift to `src/lib/` or `src/components/` only when a 2nd route consumes it.
- `src/components/ui/` shadcn primitives (radix-mira preset). `src/components/` app-specific composed.
- `src/lib/` cross-cutting client utils + shared domain types. `src/server/` server-only. `src/db/` Drizzle. `src/integrations/` framework wiring.
- `src/features/<name>/` — self-contained feature modules (domain + `components/` + `server.ts`), exposing a public surface via `index.ts` barrel that other features import. Route files stay in `src/routes/<name>/` (Start scans only `src/routes`); the slice holds everything else. Migration out of the flat `src/server/`/`src/components/scores`/`src/lib` split — slices: tasks, notes, inbox, inventory, evaluation (scores + evals + datasets are one bounded context; `lib/eval` stays as shared scoring kernel), mcp, inspect (UI `components/` + pure `logic/`, barrel-gated). `src/server/` now holds only `detection` (genuinely shared by home + inventory); single-consumer server fns moved into their slice's `server/` (e.g. `agent-run`→evaluation; `logs`/`breakdowns`/`enrich-span`→inspect). `src/lib/` holds the shared kernel/core (`spans`, `eval`, `telemetry`, `tools`, `alerts` + util files).

## Map

- **No local mirror DB for telemetry.** Spans/traces/sessions are fetched at query time from the active provider in `src/lib/telemetry/` (OpenObserve / App Insights) — `dev.db` (Drizzle) holds only app state (scores, datasets, notes, prompts, inventory…). A score/note references a span by id; it can't FK or validate it locally.
- App shell: `src/routes/__root.tsx` mounts `AppSidebar` + the `Session`/`Trace` drawer mounts (controlled by `?session=` / `?trace=` URL params, so any page can open either drawer). Individual pages mount their own `SiteHeader`.
- `/sessions` and `/traces` lists open `InspectDrawer` via URL params; `/sessions/$sessionId` and `/traces/$traceId` are the full-page versions for permalink/cold-open. Both pages and both drawers share the same inner view components — edit those, not the shells.
- `/traces` has two tabs: Traces (end-to-end runs; utility traces filtered out) and Spans (`?tab=spans`, lazy-fetched) listing utility purpose-attr spans + sub-agent invocations (`invoke_agent` under `execute_tool`). When the inspector is open, cmd+k narrows to spans in that session (`exclusive` provider in `use-span-search.tsx`).
- Inspect slice (`src/features/inspect/`, shared by sessions + traces; consumed via its `index.ts` barrel — except pure-logic unit tests import `logic/` deep to avoid pulling React/db): `components/` UI (`drawer.tsx` Sheet shell · `overview.tsx` `InspectLayout` Spans-tab layout + inspector tabs · `tree.tsx` left pane · `detail-panel.tsx` right pane · `context.tsx` Context-tab · `context-segments.ts` stacked-bar math · `view-bar.tsx` `InspectViewBar`) and `logic/` pure non-React helpers (`predicates.ts`, `tools.ts`, `turns.ts`, `system.ts` — formerly `lib/inspector-view`). A single generic `InspectDrawerHost` (`components/drawer-host.tsx`, barrel-exported) is mounted twice in `src/routes/__root.tsx` — one per entity, each bound to its own query. Keep pure helpers in `logic/` `.ts` files so tests don't pull `src/db` via React imports.
- Span domain layer in `src/lib/spans/`: `index.ts` (`Span` type + normalization helpers), `conversation.ts`, `tokens.ts`. Eval/scoring domain in `src/lib/eval/` (`evaluation.ts`, `judge-templates.ts`, `dataset-input.ts`, `span-eval-snapshot.ts`). Formatting: `src/lib/format.ts`.
- Ingest: `src/lib/spans/classify-span.ts` (OTel bag → typed `Classification`); deep dive at `docs/explanation/03-classify-span.md`. Provider clients in `src/lib/telemetry/` — no local mirror DB. Attribute reference: `docs/reference/ai-attributes.md` (full OTel catalog). Convention spec (curated subset loupe reads + stamps, including `gen_ai.task.*` and `tag.tags`): `docs/explanation/02-spec.md`.
