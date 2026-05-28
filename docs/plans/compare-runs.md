# TODO — Compare two runs side-by-side

Goal: pick any two runs (same agent, different agents, regression vs main, etc.) and view them in a split layout that lets you trace what diverged.

## Open questions (decide first)

- **Run selection UX** — how does a user reach compare mode?
  - Multi-select checkboxes on `/runs` list, then a "Compare (2)" button.
  - "Compare with…" action on `/runs/$runId` (modal picker of recent runs).
  - Both. Probably start with the second (cheaper), add multi-select once the diff layout proves useful.
- **URL shape** — `/runs/compare?a=…&b=…` or `/runs/$a/vs/$b`. The querystring form is easier (TanStack Router search params, swappable A/B, future N-way).
- **Sync behavior** — when the user clicks a span on the left, should the right side jump to the matching span? Default to synced; toggle to unsync. Matching key: `name + parent path` (not span id, since ids differ across runs).
- **What counts as "matching"** for diff highlighting? `(operation_name, depth, sibling_index)` is a reasonable v1. Anything more needs an actual tree-diff algorithm.

## Layout sketch

```
┌─ /runs/compare?a=4821&b=4830 ────────────────────────────────────┐
│ Run #4821  agent-v1  2.31s  18 spans      ←  →  Run #4830  ... │
│ Δ +0.84s · +3 spans · +1,204 tokens · $0.012 ─────────────────  │
├──────────────────────────────┬──────────────────────────────────┤
│ [Spans | Turns]              │ [Spans | Turns]                  │
│  ├─ chain                    │  ├─ chain                        │
│  │  ├─ llm.call    ✓ same    │  │  ├─ llm.call    ✓ same         │
│  │  └─ tool.search ✓ same    │  │  ├─ tool.search ✓ same         │
│  │                           │  │  └─ tool.fetch  ＋ added       │
│  └─ render                   │  └─ render                       │
├──────────────────────────────┴──────────────────────────────────┤
│ Detail (selected span on either side; shows A | B fields diff)  │
└─────────────────────────────────────────────────────────────────┘
```

- Both panels reuse the existing `TreeView` / `TurnsView` (`src/routes/runs/$runId.tsx:80`).
- Header shows aggregate deltas, computed client-side from both span sets.
- Footer "Detail" panel is shared — selecting a span on either side opens an A | B field-level comparison.

## Build steps

- [ ] Route: `src/routes/runs/compare.tsx` with search-param validation for `a` and `b`. Loader fetches both traces in parallel via `getTrace`.
- [ ] Fallback for missing run (one side fails): render the side that loaded, show an inline error on the missing side. Don't 404 the whole page.
- [ ] Extract shared shell from `src/routes/runs/$runId.tsx` — header meta block and span tree section — into a small component so single-run and compare pages don't drift.
- [ ] Header delta bar: duration, span count, token usage, cost, error count. Pulls from existing aggregates already computed for the single-run view.
- [ ] View toggle (Spans / Turns) — single toggle that controls both panels (don't allow mismatched views in v1; revisit if needed).
- [ ] Span-matching function: given two `Span[]` trees, return a map `aId → bId | null` and `bId → aId | null`. Key on `(operation_name, depth, sibling_index)`. Mark unmatched spans as added/removed; mark matched-but-differing in duration/status as changed.
- [ ] Tree rendering: extend `TreeView` to accept an optional `matchState: 'same' | 'added' | 'removed' | 'changed'` per row, render as a colored gutter chip on the right.
- [ ] Selection sync: when user clicks span on side A, look up the match in side B and select it there. Toggle in header to disable sync.
- [ ] Detail panel: when both A and B have the selected span, render side-by-side attributes with a simple diff (changed values highlighted). When only one side has it, show single column with "missing in other run" banner.
- [ ] Entry points:
  - "Compare with…" button on `/runs/$runId` header → modal listing recent runs (reuse `mock-runs.ts` shape for now) → on select, navigate to `/runs/compare?a=current&b=picked`.
  - (Later) Multi-select checkboxes on `/runs` list with a sticky "Compare (n)" action bar — disable when n ≠ 2.
- [ ] Empty / degenerate states: same run on both sides (block the navigation or render with a "same run" notice), one run missing, both missing.
- [ ] Update sidebar/nav if compare deserves its own entry. Probably not — it's reached from run detail, not from nav.

## Nice-to-have (don't block v1)

- [ ] Swap button (A ↔ B) in the header.
- [ ] Permalink that captures view mode + selection.
- [ ] "Pick a third run" → N-way compare (probably never; 2 covers 95% of regression workflows).
- [ ] Diff rules editor: ignore timing drift under X ms, ignore certain attribute keys.
- [ ] Save a comparison as a "baseline" — ties into the evals comparison story in `docs/plans/evaluation.md`.

## Non-goals (v1)

- Smart semantic diff of LLM outputs (token-level highlighting). Cosmetic, expensive, can add later.
- Aligning spans by content rather than tree position. Most real divergence is structural; alignment heuristics rarely earn their complexity.
- Comparing >2 runs.
