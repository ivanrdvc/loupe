# Explanation

The "why" of agentops subsystems. Mental models, architecture, trade-offs.
Longer-form prose. The highest-leverage section — if you can only write one
doc, write it here.

## Ingest & classification

- [Agent trace topology](agent-trace-topology.md) — why we infer agent topology
  from span trees, the shapes runtimes actually emit, the one primitive that
  handles all of them, and which rules are guesses we'd rather replace with
  real signals.
- [Span classification](classify-span.md) — one function owns every rule for
  turning raw OTel attributes into a Span's GenAI-shaped fields. Why it lives
  in one file, what it handles, and how to add a new provider.

## Subsystems

- [MCP read-through registry](mcp-read-through.md) — how agentops reads MCP
  registry references, fetches live server capabilities, and keeps SQLite
  limited to local app state.
- [Sessions vs Runs](sessions-vs-live.md) — two top-level UI entries, two
  different jobs. Sessions is pure observability; Runs is the
  active / single-execution surface.
- [Session sidebar Recent](session-sidebar-recent.md) — how the Sessions page
  and the sidebar Recent list differ.

## Cross-cutting

- [Code organization](code-organization.md) — where each kind of module lives.
  Lib stays pure; routes own their data via `-data.ts`; React hooks, DB code,
  and server-only logic each have a home.
