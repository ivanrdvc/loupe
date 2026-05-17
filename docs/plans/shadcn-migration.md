# shadcn migration plan

Migrating the whole app from Catalyst (`@headlessui/react`) to shadcn-ui (`@radix-ui/*`), modeled on the upstream shadcn examples:

- App shell + sidebar: [ui.shadcn.com/examples/dashboard](https://ui.shadcn.com/examples/dashboard) — adapted to use Ivan's preset + UX preferences (see Style locks below)
- Data table (sessions): [ui.shadcn.com/examples/tasks](https://ui.shadcn.com/examples/tasks)
- Theme picker: 12 chromatic accents over the active preset (light/dark/system mode + accent swap), wired through `next-themes`

Phases 1–3 are **shipped and committed** on `feat/shadcn-migration`. Phases 4–7 are still pending.

> **If you are an autonomous AI taking over this migration:** read [shadcn-handover.md](./shadcn-handover.md) first. It's the short execution-ready brief. This file is the long reference.

---

## Style locks (post-preset, current truth)

These were not all decided up front — they crystallized while shipping Phase 1–3. Do not relitigate without explicit user approval.

| Choice | Value | Notes |
|---|---|---|
| **shadcn style** | `radix-mira` | Applied via `pnpm dlx shadcn@latest init --preset bKZWo2zY --template vite`. Replaces the original `new-york` plan. Modern shadcn 4.x preset. |
| **Base color** | `stone` | Replaces the original `zinc` plan. Stone-tinted neutrals (slight purple-blue chroma). |
| **Primary accent** | Rose/pink | `oklch(0.525 0.223 3.958)` light / `oklch(0.459 0.187 3.815)` dark. From the preset hash. |
| **Icon library** | **`@hugeicons/react`** + `@hugeicons/core-free-icons` | All shadcn primitives and `app-sidebar.tsx` use this. `lucide-react` is dead dep. Page-level code still uses `@heroicons/react` and migrates per-page. |
| **Sans font** | Pretendard Variable | Preset wanted Inter; we override via `--font-sans` in `@theme inline`. CDN link in `__root.tsx` stays. |
| **Radius** | `--radius: 0.625rem` | Preset default. Was `0.5rem` pre-preset. |
| **Theme provider** | `next-themes` (`attribute="class"`, `defaultTheme="dark"`, `storageKey="theme"`) | Coexists with the legacy `useTheme` hook (still used by `settings-dialog.tsx`) until Phase 4 rewrites the dialog. |
| **Tooltip provider** | `<TooltipProvider delayDuration={0}>` wraps the app inside `ThemeProvider` | The `radix-mira` `SidebarProvider` does NOT include it (old `new-york` version did). Required because `SidebarMenuButton` consumes `tooltip` prop. |
| **Sidebar variant** | `collapsible="none" className="h-auto border-r"` | Matches dashboard example. No `variant="inset"`, no `SidebarTrigger`. |
| **Content card** | `<SidebarInset className="md:m-2 md:ml-0 md:rounded-xl md:border md:shadow-sm">` | Manual className override on SidebarInset gives Ivan's preferred Catalyst-style rounded floating card without using `variant="inset"`. Deviation from dashboard example's flat edges. |
| **Inbox badge** | Icon-overlay animated ping (`animate-ping` rose-500 + pill on icon corner) | NOT `SidebarMenuBadge`. Per Ivan's UX preference — matches the old catalyst behavior. |
| **Sidebar header** | `<SidebarHeader className="border-b">` with brand as a proper `<SidebarMenu>/<SidebarMenuItem>/<SidebarMenuButton asChild>` linking to `/` | Matches dashboard example pattern. |
| **No SidebarTrigger anywhere** | Removed at Ivan's explicit request | With `collapsible="none"` the sidebar is always inline, no off-canvas state, so no trigger needed. Mobile users get a full-width sidebar (16rem of 375px viewport). Known UX tradeoff. |
| **`--color-accent-*` (purple) + `--color-accent-warm-*` + `--color-focus-500`** | Kept in `styles.css` under `@theme` | Live consumers in pages and remaining catalyst files. Phase 7 deletes once consumers are migrated. |
| **Catalyst quarantine** | `src/components/ui/catalyst/` | 9 files left (avatar, button, dialog, dropdown, input, link, pagination, table, text). Phase 7 deletes the folder. |

## Where the catalyst kit still lives in the app

After Phase 3, page internals still import from `#/components/ui/catalyst/*`. Each later phase migrates consumers off these:

- `Avatar` — used by `app-sidebar.tsx` footer (already on shadcn — only catalyst Avatar import is gone from this file)
- `Button` — used by `settings-dialog.tsx`, `inbox/index.tsx`, `router-error.tsx`
- `Dialog` — used by `settings-dialog.tsx` (the existing dialog) — Phase 4 replaces with shadcn Sheet
- `Dropdown` — used by `auto-refresh-select.tsx`, `badge-select.tsx`, `time-range-select.tsx` — Phase 5 replaces inside the sessions toolbar
- `Input` — used by `settings-dialog.tsx` — Phase 4
- `Link` — used by `index.tsx`, `inbox/index.tsx`, `runs/$runId.tsx`, `sessions/$sessionId.tsx`, `sessions/-components/session-inspect/drawer.tsx` — Phase 6
- `Pagination` — currently unused, can be deleted in Phase 7
- `Table` — used by `index.tsx`, `inbox/index.tsx`, `mcp/index.tsx` — Phase 6
- `Text` — currently only used internally by `dialog.tsx` — drops with dialog migration

---

## Phase 0 — Decisions (locked, see Style locks above) ✅

| Decision | Choice |
|---|---|
| **Tailwind setup** | v4, `@theme inline` maps OKLCH vars → utilities |
| **Theme provider** | `next-themes` |
| **Style** | `radix-mira` (preset hash `bKZWo2zY`) — replaces original `new-york` plan |
| **Catalyst during migration** | Quarantined in `src/components/ui/catalyst/`. Both kits coexist until Phase 7. |

---

## Phase 1 — Foundation (no visible change) ✅

Committed in `affd627`.

- Installed: `class-variance-authority`, `tailwind-merge`, `tw-animate-css`, `next-themes`
- `components.json` authored manually (Vite + Tailwind v4) — original was `new-york`/`zinc`/`lucide`; later overwritten by Phase 3's preset re-init
- `src/lib/utils.ts` with `cn()` helper
- `styles.css`: shadcn OKLCH tokens, `@theme inline` mapping, `@layer base { * { @apply border-border outline-ring/50 }}` rule (critical — Tailwind v4 defaults `border` to `currentColor` without it)
- Moved 12 Catalyst components → `src/components/ui/catalyst/`. Rewrote 21 import sites
- Wired `next-themes` `ThemeProvider` in `__root.tsx`

## Phase 2 — Core primitives ✅

Committed in `3ca559e`.

Installed 22 primitives via `pnpm dlx shadcn@latest add`. Lands `src/components/ui/{button,card,sheet,dialog,tabs,scroll-area,separator,popover,input,label,select,checkbox,switch,table,badge,avatar,skeleton,tooltip,dropdown-menu,command,sonner,sidebar}.tsx` + `src/hooks/use-mobile.ts`.

Note: these were later **rewritten** by the Phase 3 preset re-init below.

## Phase 3 — App shell swap + radix-mira preset ✅

Committed in `5528f1f` + `0303e94` + the WT changes about to be committed.

### App shell

- New `src/components/app-sidebar.tsx`: brand block (logo + version) as a `SidebarMenuButton`, main nav (Home/Sessions/Runs/MCP/Evals) with route-prefix active state, Recent section (last 5 user sessions), Settings (opens dialog) + Inbox (animated ping badge on icon), account dropdown footer (avatar + name + email + theme toggle + sign out)
- `__root.tsx`: `ThemeProvider` → `TooltipProvider` → `SidebarProvider` → `AppSidebar` + `SidebarInset` (with manual rounded card className)
- Deleted: `application-layout.tsx`, `catalyst/{sidebar,sidebar-layout,navbar}.tsx`. `data-accent="cursor"` html attr removed.

### Preset re-init mid-phase

Ivan picked a style on shadcn.com's customizer and ran the resulting command:

```
pnpm dlx shadcn@latest init --preset bKZWo2zY --template vite --force
```

This overwrote `components.json`, every primitive in `src/components/ui/*.tsx`, `src/lib/utils.ts`, `src/hooks/use-mobile.ts`, `src/styles.css` (token block); added `input-group.tsx` + `textarea.tsx`; added deps `@fontsource-variable/inter`, `@hugeicons/core-free-icons`, `@hugeicons/react`, and `shadcn` (runtime dep — unusual, can move to devDeps in Phase 7).

**Post-preset cleanup applied:**
- Deduped `tw-animate-css` import in `styles.css`
- Overrode `--font-sans` back to Pretendard via `@theme inline`; dropped `@fontsource-variable/inter` import + dep
- Switched `app-sidebar.tsx` icons from `lucide-react` to `@hugeicons/core-free-icons` (`Home01Icon`, `MessageMultiple01Icon`, `PlayCircleIcon`, `PuzzleIcon`, `TestTubeIcon`, `Settings01Icon`, `InboxIcon`, `UserCircleIcon`, `Moon01Icon`, `Sun01Icon`, `Logout01Icon`, `ArrowUpDownIcon`) via the `<HugeiconsIcon icon={...} />` wrapper pattern
- Deleted orphan `src/globals.css`
- Added `correctness.useExhaustiveDependencies`, `a11y.useSemanticElements`, `a11y.useKeyWithClickEvents` to `biome.json` overrides for `src/components/ui/**` so upstream code stays byte-faithful
- Added `<TooltipProvider delayDuration={0}>` wrap in `__root.tsx` (radix-mira `SidebarProvider` doesn't ship with it; without it `tooltip` prop on `SidebarMenuButton` 500s)

### Documented deviations from the dashboard example

- **Rounded floating content card** via `SidebarInset` className override — dashboard example has flat edges
- **Inbox icon-overlay animated ping** — dashboard pattern would use `SidebarMenuBadge`; we keep the old catalyst-style notification dot per Ivan's UX preference
- **No `SidebarTrigger`** — dashboard example has one in `SiteHeader`; we removed at Ivan's request. Sidebar is always-visible inline (`collapsible="none"`) so there's nothing to toggle on desktop, and on mobile the sidebar takes 16rem of viewport width (acceptable tradeoff)
- **`lucide-react` still installed** but unused — Phase 7 sweep removes

---

## Phase 4 — Settings dialog + theme picker (PENDING)

**Goal:** replace `src/components/settings-dialog.tsx` (currently a Catalyst Dialog) with a shadcn Sheet, and add a theme picker matching shadcn's customizer.

**File-level plan:**

1. **Replace dialog with sheet** in `src/components/settings-dialog.tsx`
   - Import `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription`, `SheetFooter` from `#/components/ui/sheet`
   - Drop catalyst `Dialog`/`DialogTitle` imports
   - Drop catalyst `Button` import → use `#/components/ui/button` (shadcn)
   - Drop catalyst `Input` import → use `#/components/ui/input` (shadcn)
   - Wrap content in `<Sheet open={open} onOpenChange={onClose}>` with `<SheetContent side="right" className="sm:max-w-md">`
   - Replace the left rail + main pane two-column layout with shadcn `Tabs`: tabs = `account`, `appearance`, `general` (keep "Data sources" inside `general`)
   - Replace the bespoke nav-button styling with `<TabsList>` + `<TabsTrigger>`

2. **Appearance tab — theme picker**
   - Theme mode: shadcn radio-card row with 3 options (Light / Dark / System). Use `next-themes`'s `setTheme` directly. Icons: Hugeicons `Sun01Icon` / `Moon01Icon` / `ComputerDesktopIcon` (or similar). Replace the existing `StatusPills` mode toggle.
   - Accent picker: 12-tile grid (button per accent), each tile is a small color swatch matching the accent's `--primary` value, with a ring around the active tile. Active value persisted to `localStorage` under key `theme-accent` and applied as `data-theme="<accent>"` on `<html>` (set via a small `useThemeAccent` hook, or extend `next-themes` with a second instance keyed by `attribute="data-theme"`).
   - **Re-add the 12 chromatic `[data-theme="..."]` blocks in `styles.css`** — port verbatim from `apps/v4/app/legacy-themes.css` (use `gh api repos/shadcn-ui/ui/contents/apps/v4/app/legacy-themes.css --jq .content | base64 -d`). 12 = `zinc`, `slate`, `stone`, `gray`, `neutral` (base palette swaps — full token replacement) + `red`, `rose`, `orange`, `green`, `blue`, `yellow`, `violet` (chromatic — override `--primary`, `--primary-foreground`, `--ring`, sidebar-primary trio, chart-*). Default (no `data-theme`) keeps the active radix-mira preset values.
   - Active accent's `--primary` color must visibly update the sidebar's active-item highlight and the rest of the UI.

3. **Account tab** — keep existing `useUserId` UI but use shadcn `<Input>` + `<Button>`

4. **General tab** — keep `ProviderRow` (rehome from current `GeneralPane`); use shadcn primitives for any catalyst inputs

5. **Delete** `src/hooks/use-theme.ts` once `settings-dialog.tsx` no longer imports it (this hook only ever had two consumers — `app-sidebar.tsx` already uses `next-themes`, settings-dialog being the last). Confirm no other consumers via grep.

**Completion criteria (autonomous AI checks):**
- `pnpm typecheck`, `pnpm check`, `pnpm build` all clean
- Dev server returns 200 on `/`, `/sessions`, `/runs`, `/mcp`, `/evals`, `/inbox`
- Toggling each of light/dark/system in the picker visibly changes the document class
- Clicking each of 12 accent swatches updates `data-theme` on `<html>` and the active highlight color of the sidebar nav
- `grep -rn "use-theme" src/` returns zero matches
- `grep -rn "ui/catalyst/dialog\|ui/catalyst/input" src/` shows zero consumers

## Phase 5 — Sessions page (DataTable from tasks example) (PENDING)

**Goal:** port the upstream `apps/v4/app/(app)/examples/tasks/` data-table architecture verbatim into `src/routes/sessions/index.tsx`.

**Components to add at `src/routes/sessions/-components/data-table/`:**

Port via `gh api repos/shadcn-ui/ui/contents/apps/v4/app/\(app\)/examples/tasks/components/<file>.tsx --jq .content | base64 -d`:
- `data-table.tsx` — wraps `@tanstack/react-table`
- `data-table-toolbar.tsx` — search input + faceted filter chips + reset button + view options
- `data-table-view-options.tsx` — column visibility dropdown
- `data-table-faceted-filter.tsx` — multi-select popovers with counts
- `data-table-column-header.tsx` — sortable header
- `data-table-pagination.tsx` — page size, prev/next, selected/total
- `data-table-row-actions.tsx` — per-row `…` menu

Install `@tanstack/react-table` first: `pnpm add @tanstack/react-table`.

Rewrite paths in copied files: `@/registry/new-york-v4/ui/X` → `#/components/ui/X`; `@/components/...` → `#/components/...`.

**Column definitions** in `src/routes/sessions/-components/data-table/columns.tsx`:

Default visible:
- Status indicator (dot + color) — adapt the existing `StatusDot` component to use shadcn tokens
- Last seen — relative time, use `formatAgo` from `#/lib/format`
- Session — title + id; click opens drawer
- Input — first message preview
- User
- Tokens
- Cost
- Turns
- Notes indicator (📝 icon when a note exists)
- Row actions (`…`)

Default hidden (toggleable via `DataTableViewOptions`):
Trace ID, Agent kind/name, Model, Provider, Environment, Source, Host/IP, Latency, Error count, Span count, Input/Output tokens split, Tags.

State persistence: column visibility + sort + filter state to `localStorage` keyed `sessions-table-state-v1`. Hydrated on mount.

**Toolbar replacements** (replace catalyst components inside the existing `/sessions` route):
- `SearchInput` → shadcn `Input` with leading icon
- `EnvSelect` → faceted filter chip
- `TimeRangeSelect` → faceted filter chip
- `StatusSelect` → faceted filter chip
- `AutoRefreshSelect` → keep as-is on the toolbar's right side (already shadcn-friendly)

**Drawer:**
- `SessionsDrawerHost` (currently a Catalyst `Dialog`) → shadcn `Sheet` (right-side, `sm:max-w-2xl` or similar wider)
- Internals (`overview.tsx`, `context.tsx`, `tree.tsx`, `drawer.tsx`, `shared.tsx`) still on Catalyst — Phase 6 migrates

**Empty state:** shadcn `Card` pattern with "clear filters" CTA when filtered-to-zero
**Loading:** shadcn `Skeleton` rows during initial fetch
**Selected row:** clicking a row that's open in the drawer applies `bg-muted` persistently

**Per-session notes (mock backend for v1):**
- Hook `useSessionNote(sessionId)` in `src/hooks/use-session-note.ts` — localStorage-backed, keyed by session id, returns `{ body, updatedAt, setBody }`
- Sidebar already has badge logic — extend to "Notes" column in the table
- Editing UI lives in the drawer's session-inspect (Phase 6 handles drawer internals; for Phase 5, expose the note via a popover from the table cell)

**Completion criteria:**
- `pnpm typecheck`, `pnpm check`, `pnpm build` clean
- `/sessions` renders the new data table with all default columns
- Faceted filters work (status, env, time range)
- Drawer opens via Sheet
- Sorting + pagination + view options work
- Filter/sort state survives page reload

## Phase 6 — Remaining pages + drawer internals (PENDING)

Migrate page internals off catalyst. Each page = swap `catalyst/X` imports for shadcn equivalents + className tweaks.

**Pages to migrate (in order, each independent):**

1. **`/inbox`** (`src/routes/inbox/index.tsx`)
   - Replace catalyst `Button`, `Link`, `Table`/`TableBody`/`TableCell`/`TableHead`/`TableHeader`/`TableRow` → shadcn equivalents
   - Swap heroicons → hugeicons where it makes sense (or defer to Phase 7)

2. **`/mcp`** (`src/routes/mcp/index.tsx`)
   - Same Table swap as inbox

3. **`/runs`** and **`/runs/$runId`** (`src/routes/runs/index.tsx`, `runs/$runId.tsx`)
   - Replace catalyst `Link`

4. **`/`** home (`src/routes/index.tsx`)
   - Replace catalyst `Link` + `Table`
   - Migrate the section cards to shadcn `Card` pattern (the bordered `<section className="rounded-lg border ...">` blocks)

5. **`/evals`** (`src/routes/evals/index.tsx`) — empty placeholder, minimal work

6. **`/sessions/$sessionId`** detail page (`src/routes/sessions/$sessionId.tsx`)
   - Replace catalyst `Link`
   - Keep existing tab structure

7. **Drawer internals** under `src/routes/sessions/-components/session-inspect/`:
   - `drawer.tsx` — catalyst `Link`
   - `overview.tsx`, `context.tsx`, `tree.tsx`, `shared.tsx` — likely heaviest Catalyst Dialog/Tabs usage; replace with shadcn `Tabs`

8. **Toolbar components** (`src/components/{auto-refresh-select,badge-select,time-range-select,search-input}.tsx`)
   - Replace catalyst `Dropdown*` → shadcn `DropdownMenu`/`Select`/`Popover` (depending on UX)

9. **Settings dialog leftovers** — by Phase 4 this is already shadcn Sheet; this phase just verifies no catalyst regressions

**Color token sweep alongside page migration:**
- Replace `accent-500`/`accent-600`/etc. → `primary`/`primary-foreground` semantic tokens
- Replace `focus-500` (catalyst-only) → `ring` (shadcn token)
- Replace `data-accent` attr usage if any remains
- The purple `--color-accent-*` scale is consumed in 36 places — most live in catalyst-internal styles that disappear in Phase 7. The few app-level usages need explicit `primary` swaps here.

**Completion criteria:**
- `pnpm typecheck`, `pnpm check`, `pnpm build` clean
- `grep -rn "from '#/components/ui/catalyst/" src/` returns zero matches outside the `catalyst/` folder itself

## Phase 7 — Cleanup (PENDING)

- Delete `src/components/ui/catalyst/` entirely (9 files)
- Remove `@headlessui/react` from `package.json`
- Remove `@heroicons/react` if zero remaining consumers (likely zero by end of Phase 6)
- Remove `motion` / `framer-motion` if zero remaining consumers
- Remove `lucide-react` (dead since Phase 3 preset swap)
- Audit + drop `--color-accent-*` purple scale from `@theme` (consumers gone after Phase 6 sweep)
- Audit + drop `--color-accent-warm-*` from `@theme` (only `palette.tsx` uses; either migrate palette or drop both)
- Drop `--color-focus-500` (catalyst-only)
- Drop the dead-now `data-accent` attr + selector references
- Move `shadcn` package from `dependencies` to `devDependencies` (it's a CLI, not runtime)
- Update memory: Catalyst default → shadcn default ([feedback_catalyst_ui_default.md](../../.claude/projects/-Users-ivan-dev-agentops/memory/feedback_catalyst_ui_default.md))
- Bump app version

**Completion criteria:**
- `pnpm typecheck`, `pnpm check`, `pnpm build` clean
- `grep -rln 'headlessui\|catalyst\|heroicons' src/ | wc -l` returns 0
- No `accent-500/600/...` or `focus-500` class names in `src/`
- Lockfile dedupe clean

---

## Faithful-recreation principle

Every UI surface is ported from the **actual upstream source** at [github.com/shadcn-ui/ui](https://github.com/shadcn-ui/ui), not freestyled:

1. Read the relevant example folder (e.g. `apps/v4/app/(app)/examples/dashboard/`, `apps/v4/app/(app)/examples/tasks/`)
2. Copy the example files into our repo at the equivalent location (mostly `src/components/...` and `src/routes/sessions/...`)
3. Adapt only the **data layer + domain naming** (tasks→sessions, reviewers→users, priority→error severity, etc.)
4. Keep the **component composition, prop signatures, and class names identical** so we get the shadcn look byte-for-byte

Document deviations explicitly (see "Style locks" above for the running list).

### Pinned upstream paths

**Dashboard example** — `apps/v4/app/(app)/examples/dashboard/`
- `page.tsx`, `data.json`, `components/{app-sidebar,chart-area-interactive,data-table,nav-documents,nav-main,nav-secondary,nav-user,section-cards,site-header}.tsx`

**Tasks example (data-table source of truth)** — `apps/v4/app/(app)/examples/tasks/`
- `page.tsx`, `data/` (schema + seed), `components/{data-table,data-table-toolbar,data-table-column-header,data-table-faceted-filter,data-table-pagination,data-table-row-actions,data-table-view-options,columns,user-nav}.tsx`

**Base primitives** — `apps/v4/registry/new-york-v4/ui/` (NOTE: the registry path is still `new-york-v4` even though our active style is `radix-mira` — the CLI handles the mapping)

**Theme customizer** — `apps/v4/components/{theme-customizer,theme-provider,theme-selector,active-theme}.tsx` + `apps/v4/lib/themes.ts`

**Legacy 12 chromatic accents** — `apps/v4/app/legacy-themes.css` (Phase 4 ports verbatim)

### How to read upstream source

- Browse: `https://github.com/shadcn-ui/ui/tree/main/<path>`
- Raw: `gh api repos/shadcn-ui/ui/contents/<path> --jq .content | base64 -d`

## Mock-first principle

**Prioritize UI shipped fast with mocked data over real backend integration.** Persistence (notes, saved views, tags, etc.) uses `localStorage` behind hook interfaces that can be swapped for real server functions later. Backend work follows once each feature's UX is locked.

## Non-decisions / iteration parking lot

- Global command palette (`cmd-k`) — shadcn ships `command`, easy to add later
- Sticky internal scroll for sessions vs. page-level scroll — decide after Phase 5 lands
- Time-bucketed group separators (Today / Yesterday / Last 7 days) for sessions
- Inline charts — recharts is cheap to add when needed (chart tokens deferred from Phase 1 — re-add then)
