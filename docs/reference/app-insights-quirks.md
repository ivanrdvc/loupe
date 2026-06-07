---
title: Application Insights quirks
type: reference
summary: Provider-specific behaviors of Azure Monitor / Application Insights
  that bite the loupe read path — attribute truncation, duplicate
  ingestion — and the mitigations applied per file.
status: stable
owner: "@ivan"
audience: anyone touching src/lib/telemetry/app-insights.ts or the inspect surface
last-reviewed: 2026-05-26
tags: [telemetry, app-insights, truncation, ingest]
---

# Application Insights quirks

App Insights' ingestion pipeline silently mangles a few things that matter for
agent telemetry. Each row below is one quirk, what it breaks, and where the
mitigation lives. Drop new findings here as they show up.

## `customDimensions` capped at 8 KB per value

App Insights truncates each `customDimensions` entry to 8192 chars. Producers
emitting large JSON payloads via OTel span attributes (the standard pattern
for GenAI semconv) lose the tail of any value that crosses the cap — `}` and
all. The truncated text fails `JSON.parse`.

Attributes seen affected in practice:

- `gen_ai.tool.definitions` — large registered-tool lists from MCP servers.
- `gen_ai.tool.call.result` — long tool outputs.
- `gen_ai.input.messages` / `gen_ai.output.messages` — long prompts or
  completions.

### Symptoms

- `Tools` tab in `/inspect` missing backend tools that the LLM actually called.
- `Result` block hidden on a tool span whose execution clearly happened.
- Messages list silently skipping the long-prompt turn.

### Mitigations

| Where | What it does |
| ----- | ------------ |
| `src/lib/spans/classify-span.ts` | Reads `gen_ai.tool.definitions` on both `chat` and `invoke_agent` spans (the invoke_agent copy is usually intact). For `gen_ai.tool.call.result`, falls back to the raw string when `JSON.parse` fails so the truncated text still renders. |
| `src/features/inspect/logic/tools.ts` | `collectToolGroups` unions chat + invoke_agent definitions and backfills name-only entries from any `tool` span that actually executed — so tools that fell off the truncated definitions list still appear in the registered-tools view. |
| `src/features/inspect/components/overview.tsx` | `SessionTools` no longer auto-classifies a "frontend" subgroup. The pre-existing heuristic (defined-but-no-execute_tool-span) mislabels backend tools whenever execute_tool instrumentation is missing or the tool ran inside an out-of-scope sub-agent — common enough under App Insights' truncation that the heuristic was net-negative. The AG-UI tab still uses it where the trade-off is acceptable. |

### Things we don't (yet) mitigate

- Truncated `gen_ai.input.messages` / `gen_ai.output.messages` are still
  rendered as-is — there's no good fallback source available consumer-side.

## Duplicate span ingestion

App Insights occasionally returns the same span twice under the same
`(operation_Id, id)` pair (retried ingestion, dual exporters, etc.). Left
unhandled this double-counts tokens, duration sums, and span counts.

### Mitigation

`src/lib/telemetry/app-insights.ts` defines `DEDUPE_SPANS_BY_ID_KQL` —
`| summarize arg_max(timestamp, *) by operation_Id, id` — and injects it into
every list-style query (`listTraces` main + cost subquery, `listSpans`
`execute_tool_ids` subquery + main, `listSessions`). `arg_max(timestamp, *)`
keeps the most recent copy and preserves all columns, so downstream `extend`
and `project` clauses continue to work unchanged.

## Adding a new mitigation

1. Add the row to the appropriate table above with a one-line "what it does."
2. Keep code comments terse — link by name to this page implicitly (no `// see
   docs/...` refs in source).
3. If the mitigation touches KQL, prefer a named constant injected via
   string interpolation over duplicating the snippet inline.
