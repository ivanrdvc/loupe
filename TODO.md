# TODO

## Feats
- Sessions — `docs/plans/sessions.md`
- Evals — `docs/plans/evals.md`
- Compare two runs side-by-side — `docs/plans/compare-runs.md`
- MCP — `docs/plans/mcp.md`
- Notes (free-form human notes on session/trace/span) — `docs/plans/notes.md`
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

## Polish
- Share button on session inspect — copy a deep link (`/sessions/$sessionId`) to
  the clipboard. Small icon button in the drawer header next to the close `✕`.
- Sessions list preview uses `SessionInspectDrawer`; full session route shares `SessionInspectLayout` (Spans + Conversation tabs).
- Home dashboard rollup subsystem — local sqlite of hourly aggregates synced from provider, dashboard reads rollups + live tail. LRU is a stopgap; rollups are the real fix for scaling to 1M+ sessions on AppInsights.
