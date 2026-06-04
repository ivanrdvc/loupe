# TODO

<!-- Keep it simple: no sections, one line per item. -->

- Compare two runs side-by-side — `docs/plans/compare-runs.md`
- MCP — `docs/plans/mcp.md`
- Experiment tags (UI only) — promote "env" filter to "Tag" filter (`tag.tags`), pull values dynamically from spans, render as chips on `/traces` and `/sessions`
- HTTP API for LLM debugging — `docs/plans/http-api.md`
- Historic data across agent versions (compare runs over time)
- Run execution is synchronous — move `runDataset` to a background job + polling (`src/server/datasets.ts`)
- Anthropic token counts are estimated (o200k BPE); exact would need the Anthropic count_tokens API (`src/lib/spans/tokens.ts`)
- Version snapshots — store judge prompt/model + example set per version so old eval/dataset versions can be viewed and re-run (currently a bare counter)
