# TODO — Compare two traces side-by-side

Goal: pick any two traces (same agent, different agents, regression vs main, etc.) and view them in a split layout that lets you see what diverged.

(Formerly titled "compare runs" — renamed because the unit is a **trace**, not a dataset run. Dataset-run comparison is a separate feature, see `datasets.md`.)

## Open questions (decide first)

- **Trace selection UX** — how does a user reach compare mode?
  - Multi-select checkboxes on `/traces` list, then a "Compare (2)" button.
  - "Compare with…" action on `/traces/$traceId` (modal picker of recent traces).
  - Both. Probably start with the second (cheaper), add multi-select once the diff layout proves useful.
- **URL shape** — `/traces/compare?a=…&b=…` or `/traces/$a/vs/$b`. The querystring form is easier (TanStack Router search params, swappable A/B, future N-way).
- **Sync behavior** — when the user clicks a span on the left, should the right side jump to the matching span? Default to synced; toggle to unsync. Matching key: `name + parent path` (not span id, since ids differ across traces).
- **What counts as "matching"** for diff highlighting? `(operation_name, depth, sibling_index)` is a reasonable v1. Anything more needs an actual tree-diff algorithm.

## Layout sketch

```
┌─ /traces/compare?a=4821&b=4830 ──────────────────────────────────┐
│ Trace 4821  agent-v1  2.31s  18 spans     ←  →  Trace 4830  ... │
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

- Both panels reuse the existing trace span tree / turns views from `src/routes/traces/$traceId.tsx`.
- Header shows aggregate deltas, computed client-side from both span sets.
- Footer "Detail" panel is shared — selecting a span on either side opens an A | B field-level comparison.

## Build steps

- [ ] Route: `src/routes/traces/compare.tsx` with search-param validation for `a` and `b`. Loader fetches both traces in parallel via `getTrace`.
- [ ] Fallback for missing trace (one side fails): render the side that loaded, show an inline error on the missing side. Don't 404 the whole page.
- [ ] Extract shared shell from `src/routes/traces/$traceId.tsx` — header meta block and span tree section — into a small component so single-trace and compare pages don't drift.
- [ ] Header delta bar: duration, span count, token usage, cost, error count. Pulls from existing aggregates already computed for the single-trace view.
- [ ] View toggle (Spans / Turns) — single toggle that controls both panels (don't allow mismatched views in v1; revisit if needed).
- [ ] Span-matching function: given two `Span[]` trees, return a map `aId → bId | null` and `bId → aId | null`. Key on `(operation_name, depth, sibling_index)`. Mark unmatched spans as added/removed; mark matched-but-differing in duration/status as changed.
- [ ] Tree rendering: accept an optional `matchState: 'same' | 'added' | 'removed' | 'changed'` per row, render as a colored gutter chip on the right.
- [ ] Selection sync: when user clicks span on side A, look up the match in side B and select it there. Toggle in header to disable sync.
- [ ] Detail panel: when both A and B have the selected span, render side-by-side attributes with a simple diff (changed values highlighted). When only one side has it, show single column with "missing in other trace" banner.
- [ ] Entry points:
  - "Compare with…" button on `/traces/$traceId` header → modal listing recent traces → on select, navigate to `/traces/compare?a=current&b=picked`.
  - (Later) Multi-select checkboxes on `/traces` list with a sticky "Compare (n)" action bar — disable when n ≠ 2.
- [ ] Empty / degenerate states: same trace on both sides (block the navigation or render with a "same trace" notice), one trace missing, both missing.
- [ ] Update sidebar/nav if compare deserves its own entry. Probably not — it's reached from trace detail, not from nav.

## Nice-to-have (don't block v1)

- [ ] Swap button (A ↔ B) in the header.
- [ ] Permalink that captures view mode + selection.
- [ ] "Pick a third trace" → N-way compare (probably never; 2 covers 95% of regression workflows).
- [ ] Diff rules editor: ignore timing drift under X ms, ignore certain attribute keys.
- [ ] Save a comparison as a "baseline" — ties into the dataset-run comparison story in `datasets.md`.

## Non-goals (v1)

- Smart semantic diff of LLM outputs (token-level highlighting). Cosmetic, expensive, can add later.
- Aligning spans by content rather than tree position. Most real divergence is structural; alignment heuristics rarely earn their complexity.
- Comparing >2 traces.
