# TODO

<!-- Keep it simple: no sections, one line per item. -->

- Monitoring loop — background scheduler for online evals + outbound alerting on score/cost/latency/error thresholds (`src/lib/alerts/kinds.ts`, `src/server/inbox.ts`); also unblocks async `runDataset`
- Judge calibration — LLM-vs-human alignment score + tuning loop (`src/lib/eval/evaluation.ts`)
- Version snapshots — store judge prompt/model + example set per version so old versions can be viewed and re-run
- Compare two runs side-by-side — `plans/compare-traces.md`
- Historic data across agent versions (compare runs over time)
- Experiment tags (UI only) — "env" → "Tag" filter (`tag.tags`), chips on `/traces` + `/sessions`
- HTTP API for LLM debugging — `plans/http-api.md`
- MCP — `plans/mcp.md`
- Anthropic token counts estimated (o200k BPE); exact needs count_tokens API (`src/lib/spans/tokens.ts`)
- RAG sidecars (embedding/retrieval as documents-with-scores) + multimodal render (image/audio message parts) — deferred until a producer emits those span shapes; classify/UI only, token-leak + base64-inflation already prevented
