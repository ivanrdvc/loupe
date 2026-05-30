# Plans

Forward-looking design proposals for unbuilt features. Each plan is a
working document — assumptions, open questions, sketch of the shape.
Once a plan ships, fold the durable "why" into `explanation/` and either
delete the plan or mark it `status: shipped` with a pointer.

Distinct from `explanation/` (current-state) and from ADRs (decided
choices, immutable log).

## Feature plans

- [Agents](agents.md) — what agents we run, what they're configured with, and
  which tools are actually attached. The demand-side counterpart to `mcp.md`.
- [Compare two traces side-by-side](compare-traces.md) — pick any two traces and
  view them in a split layout that surfaces what diverged (formerly "compare runs").
- [Datasets](datasets.md) — named, versioned sets of questions fired at your
  agent over HTTP, with answers linked back to their traces and compared across
  runs.
- [HTTP API for LLM debugging](http-api.md) — expose loupe's
  classification / reconstruction / aggregation views over plain endpoints so
  an LLM-driven dev tool can pull run data while a developer is debugging.
- [MCP](mcp.md) — registry of MCP servers and tools so non-AI teams can ship
  tools without quietly degrading agents.
- [Sessions](sessions.md) — the conversation itself as a first-class object,
  with OTel sitting underneath as the carrier.
