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
- [Evaluation](evaluation.md) — scores, human annotations, datasets, and an
  in-app LLM-judge runner, built emitter-agnostic on OTel `gen_ai.evaluation.*`.
- [HTTP API for LLM debugging](http-api.md) — expose loupe's
  classification / reconstruction / aggregation views over plain endpoints so
  an LLM-driven dev tool can pull run data while a developer is debugging.
- [MCP](mcp.md) — registry of MCP servers and tools so non-AI teams can ship
  tools without quietly degrading agents.
- [Sessions](sessions.md) — the conversation itself as a first-class object,
  with OTel sitting underneath as the carrier.
