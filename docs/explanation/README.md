# Explanation

The "why" of loupe subsystems. Mental models, architecture, trade-offs.
Longer-form prose. The highest-leverage section — if you can only write one
doc, write it here.

## Read first (ordered)

- [01 — Architecture](01-architecture.md) — how loupe reads OTel traces,
  classifies spans, layers session / purpose / category / errors / sub-agent
  inference on top, and where every piece lives in the code. Includes the five
  trace topologies and the fallback inference rules.
- [02 — Convention spec](02-spec.md) — the curated subset of OTel + extensions
  loupe operates on. What producers emit, what loupe reads, what gets
  stamped consumer-side. Includes the per-category producer emission
  checklist.
- [03 — Span classification](03-classify-span.md) — one function owns every
  rule for turning raw OTel attributes into a Span's GenAI-shaped fields. Why
  it lives in one file, what it handles, and how to add a new provider.

## Subsystems

- [MCP read-through registry](mcp-read-through.md) — how loupe reads MCP
  registry references, fetches live server capabilities, and keeps SQLite
  limited to local app state.
- [Sessions vs Runs](sessions-vs-live.md) — two top-level UI entries, two
  different jobs. Sessions is pure observability; Runs is the
  active / single-execution surface.
- [Session sidebar Recent](session-sidebar-recent.md) — how the Sessions page
  and the sidebar Recent list differ.
- [Tasks](tasks.md) — what the Tasks page shows: machine-driven agent runs
  (scheduled, event, webhook, background) rolled up by task identity.
  Read-only over OTel.

## Cross-cutting

- [Code organization](code-organization.md) — where each kind of module lives.
  Lib stays pure; routes own their data via `-data.ts`; React hooks, DB code,
  and server-only logic each have a home.
