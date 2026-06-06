# Explanation

The "why" of loupe subsystems. Mental models, architecture, trade-offs.

## Read first (ordered)

- [01 — Architecture](01-architecture.md) — how loupe reads OTel traces and where every piece lives.
- [02 — Convention spec](02-spec.md) — the curated subset of OTel loupe reads and stamps.
- [03 — Span classification](03-classify-span.md) — the one function that types raw attributes.

## Subsystems

- [Detection and enrichment](detection-and-enrichment.md) — discovering new tools/agents and recovering truncated attributes.
- [Datasets](datasets.md) — versioned question sets fired at the agent, linked back to traces.
- [Evaluation](evaluation.md) — one `score` primitive for human / judge / code verdicts.
- [MCP read-through registry](mcp-read-through.md) — reading MCP registries and live server capabilities.
- [Sessions vs Runs](sessions-vs-live.md) — observability surface vs active-execution surface.
- [Tasks](tasks.md) — machine-driven agent runs rolled up by task identity.

## Cross-cutting

- [Code organization](code-organization.md) — where each kind of module lives.
