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

- **Left** — `TurnsView` (`src/components/turns-view.tsx`): token-usage table (`# · Time · In · Out · Errs · Turn · Σ · Dur` + Total), the breakdown panel below (`System prompts · Tool definitions · Messages · Prompt cache · Total`) computed by `useBreakdowns` (`src/hooks/use-breakdowns.ts`) on top of `breakdownChat` in `src/lib/spans/tokens.ts`, then one card per turn with status / cost / duration.
- **Right** — `ConversationView` (`src/components/conversation-view.tsx`): chat bubbles, paired tool cards, agent cards. Renders `ConversationEvent[]` from `src/lib/spans/conversation.ts`.

**Spans tab.** Span tree (`InspectLayout`, `src/components/inspect/`) + turn strip + span detail (`DetailPanel`). Hides naked `http` transport spans while keeping subtree rollups contiguous. Same components render the slide-over `InspectDrawer` used by both the sessions and traces lists.

## Run detail (`/runs/$runId`)

Just the conversation, full width — `ConversationView` and nothing else. One run is one assistant turn; the aggregate-per-turn panel has nothing to chew on at this scale.

What's coming next here:

- **Live tail.** Spans appear in the conversation as they flush from the exporter — granularity is one span, not tokens.
- **Direct ingest.** An app POSTs events to us instead of going through OTel. Same render.
- **Initiate a run.** Send a prompt from the UI to a configured agent endpoint; the conversation that comes back is just another run.

The Spans/waterfall view can come back behind an opt-in if needed — not the default.

## List pages

`/sessions` lists multi-turn conversations grouped by session attribute. `/traces` has two tabs:

- **Traces tab** — one row per `trace_id`, end-to-end runs. Utility traces (those whose root span carries `gen_ai.operation.purpose`) appear here naturally if the producer emits them as their own trace. Category facet filter: Chat, Sub-agent, Scheduled, Event, Webhook, Background, Utility, Orphan.
- **Spans tab** (`?tab=spans`) — lazy-fetched flat list of *nested* spans worth surfacing on their own: utility purpose-attr spans inside a larger trace (title-gen, memory.* sitting inside a chat trace) and sub-agent invocations (`invoke_agent` whose parent is `execute_tool`). Each row links to its parent trace; clicking opens the trace with that span focused. Sub-agents stay here permanently — they are not root spans, so promoting them to Traces rows would conflate `trace_id` with span identity. (Decision recorded in [`02-spec.md`](02-spec.md#rejected--sub-agents-as-first-class-traces-rows).)

A utility appears in **one** place, determined by emission shape:
- emitted as its own trace → Traces tab (category: utility)
- emitted as a nested span → Spans tab (kind: utility)

**How the Spans tab works (fallback path):**

The `listSpans` provider method runs one query per provider that returns rows matching either: (a) `gen_ai.operation.purpose IS NOT NULL AND parent_span_id IS NOT NULL`, or (b) `operation_name LIKE 'invoke_agent %' AND parent_span operation_name LIKE 'execute_tool %'`. Each row carries a `kind` discriminator (`utility` | `sub-agent`) and a `label` (the purpose name or the agent base name). These structural rules cover producers that don't stamp `gen_ai.task.parent.id` natively; when the attribute is present the normaliser uses it directly — see [`02-spec.md`](02-spec.md).

**What shows where:**

| Trace type                               | `/sessions`                    | `/traces` (Traces tab)             | `/traces?tab=spans`           |
| ---------------------------------------- | ------------------------------ | ---------------------------------- | ----------------------------- |
| Chat trace with session attr             | ✓ (grouped into session)       | ✓                                  | —                             |
| Scheduled / event / webhook / background | Only if it has a session attr  | ✓                                  | —                             |
| Utility trace (root purpose attr)        | —                              | Hidden (rendered as span instead)  | ✓                             |
| Sub-agent span (invoke_agent / exec_tool) | Visible in session's span tree | —                                  | ✓ (kind: sub-agent)           |
| Purpose-span inside a chat trace         | Visible in session's span tree | —                                  | ✓ (kind: utility)             |
| Orphan (no session, no category signals) | ✗                              | ✓                                  | —                             |

Toolbar pieces (`SearchInput`, `DataTableFacetedFilter`, `TimeRangeSelect`) plus `formatAgo` / `formatCost` / `truncateId` in `src/lib/format.ts` are shared across both.

### Sidebar Recent

`/sessions` shows **all** sessions (operator view, unscoped). The sidebar **Recent** list is personal: your last 5, scoped server-side by `loupe:user-id` (set in Settings → Account, read via `useUserId()` in `src/hooks/use-user.ts`). No ID set → the query is disabled and Recent is hidden entirely. Placeholder until real auth lands.

## Data fetching

Route loaders call `context.queryClient.ensureQueryData(...)` and routes read via `useQuery(...)`. Per-route `queryOptions` ship next to loaders (e.g. `sessions/-data.ts`, `runs/-data.ts`); stable keys live in `src/lib/query-keys.ts`.

## Where to extend

| You want to…                                                   | Edit                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Show a new per-span field                                      | `Span` in `src/lib/spans/index.ts`, then lift in `src/lib/spans/classify-span.ts` (both dotted and underscore-flattened forms)                                                                                                                     |
| Add a new event kind in the chat (eval result, feedback, etc.) | New arm on `ConversationEvent` in `src/lib/spans/conversation.ts`, render in `ConversationView`                                                                                                                                              |
| Add a format helper                                            | `src/lib/format.ts` — don't reinvent                                                                                                                                                                                                   |
| Support a new tokenizer family                                 | Extend `resolveFamily` in `src/lib/spans/tokens.ts`. Lazy-load the encoder data                                                                                                                                                              |
| Add a new data source for Sessions (DB, external)              | The session detail loader in `src/routes/sessions/$sessionId.tsx`. Page only consumes `Span[]`, so anything that yields spans works                                                                                                    |
| Add live tail / direct ingest                                  | `src/routes/runs/$runId.tsx`: replace the one-shot `runSpansQuery` fetch with a subscription that pushes spans into `ConversationView`. Lists can reuse `runSpansQuery` keys from `runs/-data.ts` or `listRecentTraces()` in telemetry |
