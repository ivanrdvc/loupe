# shadcn migration plan

Migrating the whole app from Catalyst (`@headlessui/react`) to shadcn-ui (`@radix-ui/*`), modeled literally on the shadcn examples:

- App shell + sidebar: [ui.shadcn.com/examples/dashboard](https://ui.shadcn.com/examples/dashboard)
- Data table (sessions): [ui.shadcn.com/examples/tasks](https://ui.shadcn.com/examples/tasks)
- Theme picker: matches shadcn's own site theme switcher (12 OKLCH accents + light/dark/system)

Each phase = one reviewable PR. Phase 0 locks decisions; Phases 1-7 are sequenced implementation.

---

## Visual identity

Only the font is locked. Everything else iterates live during implementation.

- **Sans font:** Pretendard Variable (keep existing — already in `styles.css`)
- **All other visual choices** (border radius, gray base, accent color, mono font, sidebar bg, page title scale, focus ring, icon library, density) — start from shadcn defaults (Zinc + Orange + Lucide + 0.625rem radius). Tweak in-place once the migration is live and we can see it. Do not block Phase 1-4 on these choices.

## Where this session left off

A first-pass shadcn-style table already exists in `src/routes/sessions/index.tsx` + `src/routes/sessions/-components/session-row.tsx` — bare HTML `<table>` with shadcn-style classes (tinted thead, solid borders, visible hover). It's a stepping stone, not the final implementation. Phase 5 replaces it with the proper `DataTable` from the upstream tasks example.

Other components in the sessions route (drawer, filter selects, status select) are still Catalyst. Phase 5 also handles those.

## Phase 0 — Decisions (LOCKED ✅)

| Decision | Choice |
|---|---|
| **Tailwind setup** | Stay on v4. Use `@theme inline` to map OKLCH vars → Tailwind utilities. |
| **Theme provider** | Replace `use-theme` with `next-themes` (matches shadcn examples, SSR-safe, class-on-html for free). |
| **Accent palettes** | Ship all 12 shadcn accents (Zinc, Slate, Stone, Gray, Neutral, Red, Rose, Orange, Green, Blue, Yellow, Violet). Cost is CSS-only. |
| **Catalyst during migration** | Move `src/components/ui/*` → `src/components/ui/catalyst/`. Install shadcn fresh into `src/components/ui/`. Both coexist until last page migrates. |
| **`--color-accent-*` token system** | Replace with shadcn's `--primary`. `accent-500/etc.` usages rewritten to `primary` page-by-page. |

---

## Phase 1 — Foundation (no visible change) ✅

- Installed: `class-variance-authority`, `tailwind-merge`, `tw-animate-css`, `next-themes`
- Authored `components.json` manually (Vite + Tailwind v4, new-york style, zinc base, `#/*` aliases) — skipped `npx shadcn@latest init` to keep the TanStack Start setup untouched
- Added `src/lib/utils.ts` with `cn()` helper (clsx + tailwind-merge)
- Rewrote `styles.css`:
  - Full Zinc OKLCH tokens in `:root` + `.dark` (background/foreground/card/popover/primary/secondary/muted/accent/destructive/border/input/ring + sidebar trio)
  - `@theme inline` mapping so `bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `bg-sidebar`, etc. are real Tailwind utilities
  - Preserved existing `--color-accent-*` (purple, 36 consumers), `--color-accent-warm-*` (palette page), `--color-focus-500` (catalyst), `.streamdown-tight` rules
- Moved 12 Catalyst components → `src/components/ui/catalyst/`. Rewrote 21 import sites (19 alias + 2 internal relative + 1 missed `./ui/button` in `router-error.tsx`)
- Removed dead `data-accent="cursor"` attribute from `<html>` (no `[data-accent='cursor']` rule ever existed)
- Wired `next-themes` `ThemeProvider` in `__root.tsx` (attribute=class, defaultTheme=dark, storageKey=theme to coexist with existing `useTheme` hook)
- `pnpm typecheck`, `pnpm check`, `pnpm build` all clean. Dev server probes: every route 200 (or 307→200).

**Deviations from this plan to circle back to in later phases:**
- 7 chromatic `[data-theme="..."]` blocks (blue/green/orange/red/rose/violet/yellow) and 4 base-palette swaps (slate/stone/gray/neutral) were *not* added — re-introduce in **Phase 4** when wiring the picker. Port verbatim from `github.com/shadcn-ui/ui` → `apps/v4/app/legacy-themes.css`.
- `--chart-1..5` tokens dropped (no consumer). Re-introduce when **recharts** lands (likely Phase 5 if a session chart is added, otherwise Phase 6).
- Dead `[data-accent='violet']` / `[data-accent='indigo']` blocks removed from `styles.css` along with `data-accent="cursor"` attr. Phase 7 sweep should confirm no remaining `data-accent` references.
- `--radius` kept at `0.5rem` (existing) rather than shadcn-default `0.625rem` — Streamdown's rounded corners would shift. Reconsider in Phase 3 when sidebar swap is the visible change.

## Phase 2 — Core primitives (no visible change) ✅

Added via `pnpm dlx shadcn@latest add ...` (all 22 primitives + `src/hooks/use-mobile.ts`):
- Surfaces: `card`, `sheet`, `dialog`, `tabs`, `scroll-area`, `separator`, `popover`
- Form: `button`, `input`, `label`, `select`, `checkbox`, `switch`
- Data: `table`, `badge`, `avatar`, `skeleton`, `tooltip`
- Menus: `dropdown-menu`, `command`, `sonner` (toast)
- Sidebar: `sidebar` (v2 — includes `SidebarProvider`, `SidebarTrigger`, etc.)

Lands in `src/components/ui/`. Nothing imports them yet (grep confirms zero consumers).

New deps the CLI added: `radix-ui` (umbrella), `cmdk`, `sonner`, lucide-react bumped to `^1.16.0`.

`biome.json` `src/components/ui/**` override extended with `correctness.useExhaustiveDependencies: off` so upstream sidebar code stays byte-for-byte faithful. One residual warning (`noDocumentCookie` in upstream `sidebar.tsx` — shadcn's standard sidebar-state persistence; left as-is).

**Review checkpoint:** files present, theme variables apply, no consumers yet. `pnpm typecheck` + `pnpm check` + `pnpm build` clean.

## Phase 3 — App shell swap (big visible change) ✅

- New `src/components/app-sidebar.tsx` using shadcn Sidebar v2 (`collapsible="none"`, mirrors prior always-visible desktop behavior; mobile sheet handled natively by the primitive)
- Single file, no nav-main/nav-secondary/nav-user splits — our sidebar is denser than the dashboard example and easier to read as one component
- Contents: brand block (logo + version), main nav (Home/Sessions/Runs/MCP/Evals) with route-prefix active state, Recent section (last 5 user sessions), Settings (opens dialog) + Inbox (with unread badge), account dropdown in footer (account/theme/sign-out)
- Icons: switched to **lucide-react** for sidebar items (matches `iconLibrary: lucide` in `components.json` and shadcn defaults). Heroicons still used elsewhere — page-by-page swap in later phases.
- `__root.tsx` wraps children with `SidebarProvider` + `AppSidebar` + `SidebarInset`. Mobile-only top header bar with `<SidebarTrigger />` for opening the drawer.
- Theme toggle now uses `next-themes`' `useTheme` directly (kept the existing `useTheme` hook around for `settings-dialog.tsx` until Phase 4 rewrites it).
- Deleted: `src/components/application-layout.tsx`, `src/components/ui/catalyst/sidebar.tsx`, `src/components/ui/catalyst/sidebar-layout.tsx`, `src/components/ui/catalyst/navbar.tsx`.
- Removed the dead `data-accent="cursor"` html attribute (no rule matched).
- Page internals still use Catalyst-from-catalyst-folder — pages look the same internally, just live inside the new shadcn chrome.

**Known visual delta:** all pages now render flush inside `SidebarInset` (`bg-background` `<main>`) — the previous Catalyst `SidebarLayout` wrapped non-`flush` pages in a rounded white card. This is the "big visible change" the plan promised; we'll iterate per-page if any feel naked.

**Review checkpoint:** new sidebar, default Zinc theme, dark mode toggle works, all routes reachable.

## Phase 4 — Settings dialog + theme picker

Match shadcn's own theme switcher:
- Settings opens a Sheet (slide-out, right side) with `<Tabs>`: **Account**, **Appearance**, **Data sources** (rehome existing settings here)
- Appearance tab:
  - Theme mode: Light / Dark / System (radio-card row with icons)
  - Accent color: 12-tile grid of color swatches with a ring around the active one
  - Persists to localStorage; `data-theme="orange"` applied to `<html>` via `next-themes`'s value attribute
- Account, Data sources tabs migrate content from current `settings-dialog.tsx`

**Review checkpoint:** flip all 12 themes × light/dark, sidebar respects accent, settings reachable from sidebar.

## Phase 5 — Sessions page (DataTable from tasks example)

Most complex page. Port the tasks-example data-table architecture:

**Components to lift from the tasks example:**
- `DataTable` — wraps `@tanstack/react-table`
- `DataTableToolbar` — search input + faceted filter chips + reset button + view options on right
- `DataTableViewOptions` — column visibility dropdown
- `DataTableFacetedFilter` — multi-select popovers (status, env, etc.) with counts
- `DataTableColumnHeader` — sortable header with `↕`/`↑`/`↓` chevron
- `DataTablePagination` — page size, prev/next, "selected / total"
- `DataTableRowActions` — per-row `…` menu (open, copy session id, copy link, etc.)

**Migration steps:**
- Define column definitions for: status, last seen, session, input, user, tokens, cost, turns, actions
- Replace `SearchInput` / `EnvSelect` / `TimeRangeSelect` / `StatusSelect` / `AutoRefreshSelect` → shadcn `Input` + `Select` wrappers inside the new toolbar (keep auto-refresh on the right; treat env + time range as faceted filters)
- Drawer: `SessionsDrawerHost` (Catalyst Dialog) → shadcn `Sheet` (right-side, wider)
- Empty state: shadcn Card pattern, with "clear filters" action when filtered to zero
- Loading: shadcn `Skeleton` rows during initial fetch
- Selected row state: clicking a row that's open in the drawer applies `bg-muted` persistently

**Columns (adapted from dashboard/tasks examples):**

Default visible:
- Status indicator (dot + color)
- Last seen
- Session (title + id)
- Input (first message preview)
- User
- Tokens
- Cost
- Turns
- Notes indicator (📝 icon when a note exists)
- Row actions (`…`)

Default hidden (toggleable via `DataTableViewOptions` — the "Reviewer" pattern from the dashboard table):
- Trace ID
- Agent kind / name
- Model
- Provider (openobserve / sentry / etc.)
- Environment (already filterable, but useful as a column)
- Source (span-attribute vs heuristic — currently inline badge)
- Host / IP
- Latency (p50 / total)
- Error count
- Span count
- Input tokens / Output tokens split
- Tags

Persistence: column visibility + sort + filter state saved to `localStorage` keyed per user. Hydrated on mount.

**Per-session notes (new UI feature — mock backend for v1):**
- Storage: `localStorage` keyed by `sessionId` → `{ body: string, updatedAt: number }`. Behind a thin `useSessionNote(sessionId)` hook so the storage layer can be swapped for Drizzle/server later without touching UI.
- Table column: 📝 icon when present, empty when absent; clicking the cell opens a popover with the note (read-only preview)
- Editing: full editor lives inside the existing session drawer as a new "Notes" section — plain text or Markdown textarea, with `updatedAt` shown
- Sessions table can faceted-filter "Has notes" / "No notes"
- Backend integration (Drizzle table + server functions) deferred to a later PR once the UX is locked.

**Iteration points (decide after seeing v1):**
- Row actions menu — which actions to include (copy id, copy permalink, dismiss, tag, …)
- Faceted filter set — which columns become facets (likely: env, status, user, agent, has-notes)
- Default column visibility set — adjust based on what's actually useful day-to-day
- Pagination vs. infinite scroll

**Review checkpoint:** sessions feels like the tasks example, drawer slides in cleanly, theme switch applies to table.

## Phase 6 — Remaining pages (one PR each, or batched)

Smaller surfaces. Migration = swap `catalyst/X` imports for shadcn equivalents + className updates:
- `/` (home)
- `/runs`, `/live`
- `/mcp`
- `/evals`
- `/inbox`
- `/account`
- `/login`
- Drawer internals: `session-inspect/{overview,context,tree,shared,drawer}` — likely heaviest Catalyst Dialog/Tabs usage outside of sessions

Each gets reviewed individually.

## Phase 7 — Cleanup

- Delete `src/components/ui/catalyst/`
- Remove `@headlessui/react` (and `@heroicons/react` + `motion` if no longer consumed) from `package.json`
- Audit for stray `accent-500/600/etc.` color refs → swap to `primary`
- Audit for any remaining `data-accent` attribute usage or `[data-accent='X']` selectors — drop both the attr and the selector if present
- Drop `--color-accent-*` purple + `--color-accent-warm-*` from `@theme` once their last consumer is gone (palette.tsx is likely the last). Drop `--color-focus-500` after all catalyst is deleted.
- Reconsider `--radius` (currently `0.5rem` for Streamdown parity) — move to shadcn-default `0.625rem` if no visual regression
- Update memory: Catalyst default → shadcn default
- **Review checkpoint:** `pnpm typecheck` + `pnpm check` clean, no Catalyst references in repo, lockfile has no dead deps.

---

## Faithful-recreation principle

Every UI surface in this migration is ported from the **actual upstream source** at [github.com/shadcn-ui/ui](https://github.com/shadcn-ui/ui), not freestyled. The flow:

1. Read the relevant example folder in the repo (e.g. `apps/v4/app/(examples)/dashboard/`, `apps/v4/app/(examples)/tasks/`).
2. Copy the example files into our repo at the equivalent location (mostly `src/components/...` and `src/routes/sessions/...`).
3. Adapt only the **data layer + domain naming**: tasks→sessions, reviewers→users, priority→error severity, etc.
4. Keep the **component composition, prop signatures, and class names identical** so we get the shadcn look and feel byte-for-byte.

### Pinned upstream paths (verified against `main` on shadcn-ui/ui)

Anywhere a phase says "port from upstream," use these exact paths. Don't approximate folder names.

**Dashboard example** — `apps/v4/app/(app)/examples/dashboard/`
- `page.tsx`
- `data.json`
- `components/app-sidebar.tsx`
- `components/chart-area-interactive.tsx`
- `components/data-table.tsx`
- `components/nav-documents.tsx`
- `components/nav-main.tsx`
- `components/nav-secondary.tsx`
- `components/nav-user.tsx`
- `components/section-cards.tsx`
- `components/site-header.tsx`

**Tasks example (data-table source of truth)** — `apps/v4/app/(app)/examples/tasks/`
- `page.tsx`
- `data/` (schema + seed)
- `components/data-table.tsx`
- `components/data-table-toolbar.tsx`
- `components/data-table-column-header.tsx`
- `components/data-table-faceted-filter.tsx`
- `components/data-table-pagination.tsx`
- `components/data-table-row-actions.tsx`
- `components/data-table-view-options.tsx`
- `components/columns.tsx`
- `components/user-nav.tsx`

**Base primitives (registry)** — `apps/v4/registry/new-york-v4/ui/`
The 57 shadcn components used by all examples. Use the registry style `new-york-v4` (matches what the examples import). Install via `npx shadcn@latest add <name>` or copy from this folder. Includes: `sidebar.tsx`, `table.tsx`, `sheet.tsx`, `dropdown-menu.tsx`, `command.tsx`, `dialog.tsx`, `tabs.tsx`, `tooltip.tsx`, `popover.tsx`, `card.tsx`, `button.tsx`, `input.tsx`, `select.tsx`, `checkbox.tsx`, `badge.tsx`, `avatar.tsx`, `skeleton.tsx`, `separator.tsx`, `sonner.tsx`, `scroll-area.tsx`.

**Theme customizer** — `apps/v4/components/`
- `theme-customizer.tsx` (the "Customize" panel from shadcn.com)
- `theme-provider.tsx`
- `theme-selector.tsx`
- `active-theme.tsx`
- `apps/v4/lib/themes.ts` (theme list)
- `apps/v4/public/r/themes/{zinc,slate,stone,neutral,gray}.json` and `new-york-v4/theme-{slate,stone,neutral,gray,zinc}.json` (token definitions per accent)

### How to read upstream source

Either:
- Browse: `https://github.com/shadcn-ui/ui/tree/main/<path>`
- Raw file (preferred when copying): `gh api repos/shadcn-ui/ui/contents/<path> --jq .content | base64 -d`

If anything deviates from upstream, call it out explicitly in the PR description.

## Mock-first principle

Throughout this migration, **prioritize UI shipped fast with mocked data over real backend integration**. Anything that needs persistence (notes, saved views, tags, etc.) uses `localStorage` or in-memory state behind a hook interface that can be swapped for real server functions later. Backend work follows once each feature's UX is locked.

## Cost reality check

- **Total effort:** ~7 PRs, 2-4 days of focused work depending on depth of `session-inspect/` drawer migration.
- **Bundle during migration:** both `@headlessui/react` and `@radix-ui/*` ship until Phase 7. Final bundle is comparable to today.
- **What this gains:** color picker, shadcn sidebar v2 (collapsible variants, mobile sheet built-in), tanstack-table features (sort/filter/select/column visibility/pagination), one consistent visual language.
- **What this does not gain:** functional capabilities. Pure UI/UX.

## Non-decisions / iteration parking lot

Things to defer or decide after seeing concrete UI:
- Whether to add a global command palette (`cmd-k`) — shadcn ships `command`, easy to add later
- Sticky internal scroll for sessions vs. page-level scroll — decide after Phase 5 lands
- Time-bucketed group separators (Today / Yesterday / Last 7 days) for sessions — nice-to-have, not in initial port
- Inline charts in sessions or home — recharts is cheap to add when needed

## Lag concern (resolved)

shadcn.com's dropdown lag is the marketing site lazy-loading example code on first interaction, not a Radix-vs-Headless-UI cost. Local bundled app renders dropdowns sub-frame (≤16ms). Indistinguishable from Catalyst in practice.
