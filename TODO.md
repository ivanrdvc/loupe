# TODO

## Feats

- Evals — `docs/plans/evals.md`
- Compare two runs side-by-side — `docs/plans/compare-runs.md`
- MCP — `docs/plans/mcp.md`
- Prompt registry → trace linkage (revisit). Two paths discussed: span-attribute
  convention (`agentops.prompt.name`, `agentops.prompt.version_hash` set by the
  user's app, agentops links automatically on ingest) vs a C# SDK package that
  injects them. Code-as-source-of-truth preferred — don't move prompts out of
  `.cs` files. Park until after Playground + Notes ship. See
  `PLAYGROUND_PROMPTS_RESEARCH.md` for the rejected detection-by-fuzzy-match
  approach and why it's worse than no linkage during an incident.
- Experiment tags — free-form string tag on spans (`agentops.tag` or reuse
  `service.namespace`) for ad-hoc grouping while testing prompt/agent changes.
  Promote the existing "env" filter to a "Tag" filter, pull values dynamically
  from spans instead of hardcoding `['main','dev']`. Closest priors: Langfuse
  `tags[]`, LangSmith `tags`, Helicone "Properties". OTel-native, no SDK
  changes needed beyond setting the attribute at ingest.
- HTTP API for LLM debugging — `docs/plans/http-api.md`
- Live ingest — spans appear in the viewer as they flush from the agent's
  OTel exporter. Granularity is one span (turn / tool call), not tokens;
  token-by-token streaming is out of scope (would require a side channel
  that bypasses OTel and violates the read-only / OTel-first stance).
- Historic data across agent versions (compare runs over time)
