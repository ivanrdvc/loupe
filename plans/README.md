# Plans

- [Agents](agents.md) — what agents we run, what they're configured with, and
  which tools are actually attached. The demand-side counterpart to `mcp.md`.
- [Compare two traces side-by-side](compare-traces.md) — pick any two traces and
  view them in a split layout that surfaces what diverged (formerly "compare runs").
- [E2E testing — sessions & inspector](e2e-testing.md) — first end-to-end suite;
  picks Playwright and establishes the data-seam + test patterns on `/sessions`
  and the inspector before extending to other surfaces.
- [HTTP API for LLM debugging](http-api.md) — expose loupe's
  classification / reconstruction / aggregation views over plain endpoints so
  an LLM-driven dev tool can pull run data while a developer is debugging.
- [MCP](mcp.md) — registry of MCP servers and tools so non-AI teams can ship
  tools without quietly degrading agents.
- [Sessions](sessions.md) — the conversation itself as a first-class object,
  with OTel sitting underneath as the carrier.
