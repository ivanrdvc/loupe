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
- [Compare two runs side-by-side](compare-runs.md) — pick any two runs and
  view them in a split layout that surfaces what diverged.
- [Evals](evals.md) — ingestion shape for eval results plus the open
  questions on data model and UI.
- [HTTP API for LLM debugging](http-api.md) — expose agentops's
  classification / reconstruction / aggregation views over plain endpoints so
  an LLM-driven dev tool can pull run data while a developer is debugging.
- [MCP](mcp.md) — registry of MCP servers and tools so non-AI teams can ship
  tools without quietly degrading agents.
- [Notes](notes.md) — free-form, human-authored notes attached to a session,
  trace, or span. The "I looked at this — here's what I found" layer on top
  of telemetry.
- [Sessions](sessions.md) — the conversation itself as a first-class object,
  with OTel sitting underneath as the carrier.
