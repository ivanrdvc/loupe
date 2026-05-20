# Sessions vs Runs

Two top-level entries in the UI, two different jobs. (`/live` redirects to `/runs` for bookmarks.)

## The split

**Sessions — pure observability.**
The conversation history of an agent. Always read-only. Today it's reconstructed from telemetry; later it may come from a DB mirror, an external API, or a paste-in. The page doesn't care where spans come from, only that it gets them.

**Runs — the active / single-execution surface.**
One OTLP trace at a time (URL param `$runId` is typically the backend `trace_id`). The landing page (`/runs`) will host live-tail, streamed events, or “start an agent here” workflows. Until that lands, `/runs` stays empty-state; `/runs/$runId` is the standalone run viewer (`ConversationView`).

The internal unit stays a **`run`** (single trace slice). Completed work that shares a **`session`** id rolls up under **Sessions** instead of a universal “all runs” list today.

|                      | Sessions                                                                                                                                                                                             | Runs                                                                                             |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Job                  | Read what happened (multi-run thread)                                                                                                                                                                | Browse / inspect individual traces                                                               |
| Unit                 | A conversation (many runs)                                                                                                                                                                           | One run (one trace_id)                                                                           |
| Read-only?           | Always                                                                                                                                                                                               | Currently — not by design                                                                        |
| Data origin (today)  | Telemetry, joined by `session.id` / `gen_ai.conversation.id` / `ag_ui_thread_id` / configured `CUSTOM_SESSION_ID_FIELDS`. Traces without a session attribute don't appear here — they belong on Runs | Telemetry via `listTraces()` — paginated table of all recent traces with category classification |
| Data origin (future) | + DB, external feeds                                                                                                                                                                                 | + live exporter stream, + direct invocation of an external agent                                 |

A session is a producer-declared conversation grouping. The session-detail page (`/sessions/$sessionId`) still accepts a bare `trace_id` in the URL (the provider's `getSession` falls back to `operation_Id` matching) so individual traces remain inspectable by direct link — they just don't clutter the list.

## Session detail (`/sessions/$sessionId`)

Default tabs: **`Conversation`** vs **`Spans`**. Search params use `view=spans`; legacy `view=trace` is still parsed as spans.

**Conversation tab (default).** Two-column.

- **Left** — `TurnsView` (`src/components/turns-view.tsx`): token-usage table (`# · Time · In · Out · Errs · Turn · Σ · Dur` + Total), the breakdown panel below (`System prompts · Tool definitions · Messages · Prompt cache · Total`) computed by `useBreakdowns` (`src/hooks/use-breakdowns.ts`) on top of `breakdownChat` in `src/lib/tokens.ts`, then one card per turn with status / cost / duration.
- **Right** — `ConversationView` (`src/components/conversation-view.tsx`): chat bubbles, paired tool cards, agent cards. Renders `ConversationEvent[]` from `src/lib/conversation.ts`.

**Spans tab.** Session span tree (`SessionInspectLayout`, `session-inspect-drawer.tsx`) + turn strip + span detail (`DetailPanel`). Hides naked `http` transport spans while keeping subtree rollups contiguous.

## Run detail (`/runs/$runId`)

Just the conversation, full width — `ConversationView` and nothing else. One run is one assistant turn; the aggregate-per-turn panel has nothing to chew on at this scale.

What's coming next here:

- **Live tail.** Spans appear in the conversation as they flush from the exporter — granularity is one span, not tokens.
- **Direct ingest.** An app POSTs events to us instead of going through OTel. Same render.
- **Initiate a run.** Send a prompt from the UI to a configured agent endpoint; the conversation that comes back is just another run.

The Spans/waterfall view can come back behind an opt-in if needed — not the default.

## List pages

`/sessions` lists multi-turn conversations grouped by session attribute. `/traces` lists individual traces (one row per `trace_id`) with a category facet filter (Chat, Sub-agent, Scheduled, Webhook, Background, Utility, Orphan).

**Default visibility on `/traces`:**

- **Session-bound chat traces are hidden by default.** Traces with a session attribute (`ag_ui.thread_id` etc.) belong on `/sessions` — showing them on both pages is redundant. A "Session traces hidden" toggle in the toolbar reveals them when needed.
- **Utility purpose-spans always show.** Spans with `gen_ai.operation.purpose` set (e.g. `title_generation`, `summarize`) are elevated to their own rows on `/traces` with Category: Utility — even if they live inside a session-bound trace. This makes auxiliary LLM work visible without navigating into the session drawer.

**How purpose-span surfacing works:**

The `listTraces` provider method runs a parallel query that fetches individual spans with `gen_ai.operation.purpose` set (non-root spans only — root purpose-spans are already captured at the trace level). These are merged into the trace list as virtual "utility" rows, sorted by time alongside real traces. Deduplication ensures a trace already classified as `utility` at the trace level doesn't also spawn per-span rows.

**What shows where:**

| Trace type                               | `/sessions`                    | `/traces`                          |
| ---------------------------------------- | ------------------------------ | ---------------------------------- |
| Chat trace with session attr             | ✓ (grouped into session)       | Hidden by default (toggle to show) |
| Scheduled / webhook / background         | Only if it has a session attr  | ✓                                  |
| Utility (root-level purpose)             | Only if it has a session attr  | ✓                                  |
| Purpose-span inside a session trace      | Visible in session's span tree | ✓ (elevated as own row)            |
| Orphan (no session, no category signals) | ✗                              | ✓                                  |

Toolbar pieces (`SearchInput`, `DataTableFacetedFilter`, `TimeRangeSelect`) plus `formatAgo` / `formatCost` / `truncateId` in `src/lib/format.ts` are shared across both.

## Data fetching

Route loaders call `context.queryClient.ensureQueryData(...)` and routes read via `useQuery(...)`. Per-route `queryOptions` ship next to loaders (e.g. `sessions/-data.ts`, `runs/-data.ts`); stable keys live in `src/lib/query-keys.ts`.

## Where to extend

| You want to…                                                   | Edit                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Show a new per-span field                                      | `Span` in `src/lib/spans.ts`, then lift in `src/lib/classify-span.ts` (both dotted and underscore-flattened forms)                                                                                                                     |
| Add a new event kind in the chat (eval result, feedback, etc.) | New arm on `ConversationEvent` in `src/lib/conversation.ts`, render in `ConversationView`                                                                                                                                              |
| Add a format helper                                            | `src/lib/format.ts` — don't reinvent                                                                                                                                                                                                   |
| Support a new tokenizer family                                 | Extend `resolveFamily` in `src/lib/tokens.ts`. Lazy-load the encoder data                                                                                                                                                              |
| Add a new data source for Sessions (DB, external)              | The session detail loader in `src/routes/sessions/$sessionId.tsx`. Page only consumes `Span[]`, so anything that yields spans works                                                                                                    |
| Add live tail / direct ingest                                  | `src/routes/runs/$runId.tsx`: replace the one-shot `runSpansQuery` fetch with a subscription that pushes spans into `ConversationView`. Lists can reuse `runSpansQuery` keys from `runs/-data.ts` or `listRecentTraces()` in telemetry |
