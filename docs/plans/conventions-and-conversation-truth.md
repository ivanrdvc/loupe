---
title: OTel conventions + conversation-truth
type: plan
summary: Four related problems across two repos. Agentops-side work is
         specified here; Teammate-side work lives in
         [teammate-producer-fixes.md](teammate-producer-fixes.md) and is
         summarized at the top of this doc. (1) Standardize Teammate's
         OTel emission. (2) Add an optional enrichment source so
         storage-layer state is surfaced in agentops alongside telemetry.
         (3) Render injected system context as context pills, not fake
         turns. (4) Fix the dedup leak in `TeammateChatMessageStore`
         that re-persists every replayed message.
status: proposed
owner: "@ivan"
audience: agentops-devs, teammate-service-devs
last-reviewed: 2026-05-19
tags: [otel, conventions, telemetry, sessions, teammate]
related:
  - teammate-producer-fixes.md
---

# OTel conventions + conversation-truth

## Why this document exists

Today an agentops user looking at a Teammate session sees:

- Sessions grouped by `ag_ui.thread_id` (an AG-UI ecosystem extension), not by `gen_ai.conversation.id` (the OTel-blessed standard).
- An incidental `agentcontext.threadid` attribute that was never intentionally designed — it's the artifact of `[CallerArgumentExpression]` capturing the C# variable name.
- A turn count derived from `invoke_agent` spans (currently correct after today's sub-agent emission fix).
- A "conversation" that, from telemetry alone, looks like 12 turns — when the persistence layer (Cosmos) actually holds 544 messages across the same conversation.
- A "user turn" that, when expanded, appears to contain two messages — but the second is an inline `system`-role injection from `MemoryInjectionProvider`, not a real user-visible turn.
- A Cosmos thread with 544 messages for what should be ~74 user turns — verified to be the same handful of user questions persisted dozens of times each (e.g. "How to configure my router?" stored 34 times). Confirmed cause: the inbound `ChatRequestMessage` contract has no `Id` property, so every replayed message arrives at the persistence layer without a stable id, gets a fresh GUID assigned, and is re-persisted as "new."

Four distinct problems. They share a doc because they look alike on the surface — they're all symptoms users hit when reading a session — and they share a root cause: **we haven't been deliberate about what telemetry is for, what it isn't, and how it should be rendered**. They are independent fixes; conflating them is what got the previous design discussion stuck.

## The four problems at a glance

| # | Problem | Fix lives on | Scope | Detailed spec |
|---|---|---|---|---|
| 1 | Standards: emit `gen_ai.conversation.id` instead of relying on `ag_ui.thread_id`-only and the accidental `agentcontext.threadid` | Teammate producer side | Audit of 5 thread-id emission sites + an activity-listener for `openinference.span.kind` | [teammate-producer-fixes.md → Fix 1](teammate-producer-fixes.md#fix-1--otel-conventions) |
| 2 | Storage truth: agentops can't show authoritative session-level facts (real title, message count, etc.) from telemetry alone, because telemetry models events, not state | agentops reader side | New optional `EnrichmentSource` interface + first impl (Teammate.Analytics) | This doc, below |
| 3 | Rendering: inline `system`-role messages inside `gen_ai.input.messages` look like conversation turns in the conversation view | agentops reader side | Conversation-view classifier + pill renderer | This doc, below |
| 4 | Dedup leak: `ChatRequestMessage` contract drops the inbound message id, breaking `FilterNewMessages` and re-persisting every replayed message as "new" | Teammate producer side | Two-line contract + extension fix, optional hash-fallback for messages without ids | [teammate-producer-fixes.md → Fix 2](teammate-producer-fixes.md#fix-2--dedup-leak-in-teammatechatmessagestore) |

The rest of the doc treats each independently. Don't bundle. **Problem 4 is the actual cause of the 544-message inflation that Problem 2 was originally trying to surface in agentops; fixing 4 reduces Problem 2 to a much smaller "show authoritative metadata" feature.** Teammate-side fixes (1, 4) are extracted into a separate doc so they can be handed to the Teammate.Api / Teammate.Agent.UI maintainers as a self-contained checklist.

## Problem 1 — Conventions (Teammate side)

**Full detail and code-level fixes live in
[teammate-producer-fixes.md → Fix 1](teammate-producer-fixes.md#fix-1--otel-conventions).**

Summary: Teammate emits the conversation id under `ag_ui.thread_id` and the
accidentally-keyed `agentcontext.threadid`, not the OTel-blessed
`gen_ai.conversation.id`. It also doesn't carry an explicit
`openinference.span.kind`. Five emission sites are catalogued in the
Teammate-side doc with exact diffs. agentops already reads
`gen_ai.conversation.id` and (with the small change below) will read
`openinference.span.kind`.

### What this doc owns (agentops-side follow-up)

After Teammate ships Fix 1:

1. **Add `openinference.span.kind` to `classifySpan`** — when present, it's
   authoritative over span-name inference:

   ```ts
   const oiKind = pickString(attrs, ['openinference.span.kind', 'openinference_span_kind'])
   if (oiKind === 'AGENT') return 'invoke_agent'
   if (oiKind === 'TOOL') return 'tool'
   if (oiKind === 'LLM') return 'chat'
   // otherwise fall through to existing inference
   ```

   File: `src/lib/classify-span.ts`. Document as "explicit signal wins" in
   `docs/explanation/classify-span.md`.

2. **Coordinate the `.env` cleanup.** After the Teammate deploy bakes in,
   remove `CUSTOM_SESSION_ID_FIELDS=agentcontext_threadid` from agentops's
   `.env`. `gen_ai.conversation.id` is already in `SESSION_ATTR_KEYS`.

3. **Doc updates.**
   - `docs/reference/ai-attributes.md` — promote `gen_ai.conversation.id`
     to the primary session-id row; demote `ag_ui.thread_id` to an
     ecosystem extension we also read.
   - `docs/explanation/agent-trace-topology.md` — note that
     `openinference.span.kind` short-circuits inference when present.

---

## Problem 2 — Conversation truth (the "544 messages" question)

### Why telemetry alone can't show it

agentops counts what's in the spans. The spans show what happened *during a turn* — the LLM call, the tools, the inputs and outputs. They don't carry the *state* of the conversation as a whole because OTel doesn't model state — it models events.

Cosmos is the system of record for the conversation state. 544 messages across 5 hours is a storage fact, not an event fact. No OTel convention exists for "your persistence layer currently holds N items related to this trace," and inventing one (`teammate.thread.message_count` was the strawman) would be putting database statistics into telemetry. Wrong layer.

Phoenix and Langfuse don't have this problem because their own pipeline is the persistence layer — they wrote those messages to their own DB and can query them. agentops's positioning is *pure telemetry reader*; it doesn't own a DB. So if we want to show storage truth, the data has to come from somewhere — and it has to come from a system that *has* the data, which is Cosmos via Teammate.Analytics for the Teammate stack.

### The shape of the fix

Add an optional, typed, provider-agnostic **enrichment source** to agentops. Same architectural pattern as telemetry providers (OpenObserve, App Insights): an interface, multiple implementations, configured via env. agentops stays generic; the Teammate stack plugs in its own implementation.

Critical design constraints:

1. **Generic interface, not Teammate-specific.** Any backend with canonical session state — Langfuse self-hosted, Phoenix, a customer's own DB — can implement it.
2. **Optional.** agentops renders fine without it. Configured backends get richer views.
3. **Session-detail only.** Not wired into the sessions list (N enrichment calls per render is a no).
4. **Additive.** Enrichment values are layered on top of telemetry-derived values, never replace them. Both are shown if they disagree, with the source labeled.
5. **Failure-safe.** Enrichment errors don't break the page.

This is fundamentally different from "agentops needs Teammate.Analytics." The interface is the contract; Teammate.Analytics is one provider. CrewAI users don't run it; they wire their own. The provider-agnostic stance survives because the abstraction is honest.

### Interface

```ts
// src/lib/enrichment/types.ts
export interface SessionEnrichment {
  // Identity / authoritative metadata
  title?: string
  userId?: string
  userName?: string
  createdAtMs?: number

  // State counts — the storage-truth fields telemetry can't carry
  messageCount?: number
  userMessageCount?: number
  assistantMessageCount?: number

  // Free-form key/value metadata for provider-specific extensions
  metadata?: Record<string, string>
}

export interface EnrichmentSource {
  name: string
  fingerprint: string
  getSessionEnrichment(sessionId: string): Promise<SessionEnrichment | null>
}
```

Mirrors the `TelemetryProvider` interface: one method, takes an id, returns canonical session-level facts.

### Implementations

**Teammate.Analytics (first)** — `src/lib/enrichment/teammate-analytics.ts`. Calls `GET /api/sessions/<id>/debug` (the endpoint Teammate.Analytics already exposes; see `references/debugging.md` in the tmate skill), maps the `thread` object onto `SessionEnrichment`.

```ts
export function createTeammateAnalyticsSource(cfg: { baseUrl: string }): EnrichmentSource {
  return {
    name: 'teammate-analytics',
    fingerprint: cfg.baseUrl,
    async getSessionEnrichment(sessionId) {
      const r = await fetch(`${cfg.baseUrl}/api/sessions/${sessionId}/debug`)
      if (!r.ok) return null
      const data = await r.json()
      const t = data.thread
      if (!t) return null
      return {
        title: t.title,
        userId: t.userId,
        userName: t.userDisplayName,
        createdAtMs: t.createdAt ? new Date(t.createdAt).getTime() : undefined,
        messageCount: t.messageCount,
        userMessageCount: t.userMessageCount,
        assistantMessageCount: t.assistantMessageCount,
      }
    },
  }
}
```

**Empty default** — no enrichment when not configured. `getActiveEnrichmentSource()` returns `null`. Renderers treat absence as "no enrichment data available," no error.

### Wiring

- `src/lib/enrichment/index.ts` — `getActiveEnrichmentSource()` mirroring `getActiveProvider()`. Env-driven: `ENRICHMENT_SOURCE=teammate-analytics` + `TEAMMATE_ANALYTICS_BASE_URL=…`.
- `src/routes/sessions/-data.ts` — new `sessionEnrichmentQuery(sessionId)` with TanStack Query. Separate cache key, separate retry. Doesn't block the page on failure.
- `src/routes/sessions/$sessionId.tsx` — call `sessionEnrichmentQuery` alongside `sessionQuery`. Pass result down.
- `src/routes/sessions/-components/session-inspect/overview.tsx` — `SessionOverview` accepts an optional `enrichment?: SessionEnrichment`. Prefers enrichment values where present:
  - Title: `enrichment.title ?? telemetryTitle`
  - User name: `enrichment.userName ?? telemetryUserName`
  - Messages: render `${turnCount} turns · ${enrichment.messageCount} messages stored` when enrichment present; just `${turnCount} turns` otherwise.
- `src/routes/sessions/$sessionId.tsx` breadcrumb — when enrichment is active, show a small `enriched by ${enrichment source name}` badge alongside the `via ${telemetry provider}` badge. Discloses the source; no magic.

### What does *not* change

- Sessions list (`/sessions`) — telemetry-only, paginated, fast. Enrichment is N+1; it's a session-detail concern.
- Span tree, conversation view, tools view — span-derived. Telemetry truth at the span level isn't a thing enrichment can or should override.
- Provider-agnostic stance documented in `docs/explanation/sessions-vs-live.md` and `docs/reference/telemetry-providers.md` — survives, because the interface is generic.

### Failure modes and edge cases

- **Enrichment source down.** `getSessionEnrichment` returns `null` (caught error). Page renders as telemetry-only. Optional warning toast.
- **Session id not in the enrichment source's data.** Same as above — `null`, telemetry-only render.
- **Enrichment says title is X, telemetry says title is Y.** Show enrichment value, label as "via teammate-analytics" in a tooltip. Don't hide the disagreement.
- **Cross-session sanity.** Enrichment caches per session id; doesn't affect other sessions.

### Doc updates

- New: `docs/reference/enrichment-sources.md` — describes the interface, the pattern, the Teammate.Analytics implementation. Lives next to `telemetry-providers.md`. Explains the distinction between event-data (telemetry) and state-data (enrichment) so future readers understand *why* there are two data planes.
- `docs/explanation/sessions-vs-live.md` — add a "Two data planes" section explaining telemetry vs enrichment. Note: enrichment is optional and additive.
- `docs/plans/sessions.md` — link forward to this doc.

---

## Problem 3 — Rendering inline injected context

### What's wrong

A `chat` span's `gen_ai.input.messages` is the literal LLM input. Producers compose it from multiple sources:

1. The user's actual message (`role=user`).
2. The accumulated prior conversation history (replayed by AG-UI on every turn, also `role=user` / `role=assistant`).
3. **Inline injected context** — system-role messages added by middleware right before the LLM call. In Teammate this comes from `MemoryInjectionProvider` (per-user memory) and similar context-providers. The role is `system` but it's *not* the agent's primary system instructions (those live separately in `gen_ai.system_instructions`); it's *additional* per-request context the LLM should consider.

Trace `373be43b-2e0a-4598-91ae-e680476ada96` (chat span `c9c8e2da6773452f`) is the canonical example:

```json
[
  { "role": "user",   "parts": [{ "type": "text", "content": "What are best practices for working with you?" }] },
  { "role": "system", "parts": [{ "type": "text", "content": "## What I know about you\n- I spend most of my week on payroll..." }] }
]
```

agentops's conversation view (`src/components/conversation-view.tsx`) currently renders both as message bubbles. From the user's perspective, this looks like two messages when there's only one user-visible turn. The "system" entry is context, not conversation.

### What this is *not*

- **Not a duplicate-message bug.** The data is correct — the LLM did receive exactly those two messages.
- **Not a Teammate emission bug.** The producer is right to attach inline memory context this way; OTel doesn't define a separate attribute for "inline context messages" so they live alongside conversation messages in the same array.
- **Not the same as the primary system prompt.** That lives in `gen_ai.system_instructions` and the conversation view already excludes it from bubbles. The `MemoryInjectionProvider` content is a *second-tier* system message that snuck in via the messages array.

### Fix

Two layers:

**Layer 1 — Classifier (`src/lib/conversation.ts`).** When constructing `ConversationEvent[]` from spans, identify inline injected `system` messages and tag them separately. Heuristics in priority order:

1. `role === 'system'` and the message *follows* a `user` message in the same chat input (positionally) → it's an inline injection, not a primary system prompt. Primary system prompts come before user messages.
2. Content matches a known injection prefix (`## What I know about you`, `## Context`, etc.) → strong signal. Make these patterns extensible per producer if needed.
3. Conservative default: when in doubt, render as a bubble — don't hide content the LLM saw.

Emit a new `ConversationEvent` arm: `{ kind: 'context_injection', source: 'memory' | 'tools' | 'unknown', content: string, spanId: string }`.

**Layer 2 — Renderer.** In `ConversationView`, render `context_injection` events as a small collapsible pill *beneath* the preceding user message:

```
┌─────────────────────────────────────┐
│ User: What are best practices...    │
│  └─ ▸ Context injected: memory (3 facts)  │
└─────────────────────────────────────┘
```

Click to expand the full injected content. Token count visible in the pill so users know the cost. Visually distinct from conversation bubbles — muted, smaller, indented.

### Where the rendering happens

- `src/lib/conversation.ts` — `buildConversation(spans)` is the entry point. Extend `ConversationEvent` union with the new `context_injection` arm. Add the classifier.
- `src/components/conversation-view.tsx` — render the new arm. Add a `ContextInjectionPill` component next to `MessageBubble`.
- `src/routes/sessions/-components/session-inspect/tree.tsx` — `MessagesBlock` / `MessageCard` should apply the same logic in the span detail panel.

### Tests

- `src/lib/conversation.test.ts` (or similar) — feed in the `373be43b` chat-input shape and assert the classifier outputs `message(user)` + `context_injection(system, memory)`, not `message(user)` + `message(system)`.
- Edge: primary system prompt only (no user message after) should still render normally — primary system prompts live in `gen_ai.system_instructions`, not in the messages array, so this case shouldn't occur in practice, but the test guards against regressions.

### Doc updates

- `docs/explanation/conversation-view.md` (new or section) — explain the three message kinds the renderer distinguishes: user turn, assistant turn, inline injected context. Why the third is rendered differently.
- `docs/reference/ai-attributes.md` — note that `gen_ai.input.messages` can contain inline `system` messages added by middleware; consumers should classify them per the conversation.ts rules.

---

## Problem 4 — Dedup leak in `TeammateChatMessageStore` (Teammate side)

**Full detail and code-level fixes live in
[teammate-producer-fixes.md → Fix 2](teammate-producer-fixes.md#fix-2--dedup-leak-in-teammatechatmessagestore).**

Summary: for session `1ebfaf20-eec4-422d-9c41-15ddd6d4901b`, Cosmos holds 87
user-role message documents across only 17 distinct content strings — e.g.
the same router question stored 34 times, "what is direct deposit?" stored
24 times. Root cause is a contract bug: `ChatRequestMessage` drops the
inbound AG-UI message id at model binding, so `AssignMissingMessageIds`
generates a fresh GUID every turn, defeating `FilterNewMessages`.

### What this doc owns (agentops-side follow-up)

None directly. Problem 4 is entirely producer-side. Once it ships:

- The dramatic "12 turns vs 544 messages" gap that motivated Problem 2
  disappears. Cosmos message counts become honest (~74 instead of 544 for
  that session).
- Problem 2's enrichment-source feature is still useful for surfacing
  authoritative metadata (title, user, real createdAt) in agentops, but
  the urgency of "show real message count" reduces to "show authoritative
  title and user."
- A short post-mortem note belongs in agentops's session view docs:
  historical sessions persisted before the Teammate fix landed will look
  inflated in any tool that counts messages from Cosmos; this is a
  pre-fix data artifact, not an ongoing bug.

---

## Implementation phases

**Recommended order**: the Teammate-side fixes ship first (Phase A = dedup
leak, Phase B = conventions) because the dedup leak is the highest-impact
issue and the conventions work makes the agentops-side cleanup cleaner. The
agentops-side phases (2, 3) below are independent and can ship in any
order.

### Teammate-side: Phases A and B

Both Teammate-side phases — Fix 2 (dedup leak, ship first) and Fix 1
(conventions) — are specified in
[teammate-producer-fixes.md](teammate-producer-fixes.md). See that doc's
"Phases" section for the exact task lists and ship criteria.

**Agentops-side follow-up after Phase B bakes in:**

- Add `openinference.span.kind` handling to `classifySpan` in
  `src/lib/classify-span.ts` (~4 lines).
- Remove `CUSTOM_SESSION_ID_FIELDS=agentcontext_threadid` from `.env`.
- Update `docs/reference/ai-attributes.md` and
  `docs/explanation/agent-trace-topology.md` per the per-problem doc
  updates above.

### Phase 2 — Enrichment interface (agentops side)

Self-contained agentops work. No Teammate dependency.

1. `src/lib/enrichment/types.ts` — `SessionEnrichment` and `EnrichmentSource`.
2. `src/lib/enrichment/index.ts` — `getActiveEnrichmentSource()`, env config plumbing.
3. `src/lib/enrichment/teammate-analytics.ts` — the first implementation.
4. `src/routes/sessions/-data.ts` — `sessionEnrichmentQuery`.
5. `src/routes/sessions/$sessionId.tsx` — call the query, pass down.
6. `src/routes/sessions/-components/session-inspect/overview.tsx` — accept enrichment, prefer enrichment values for title / user / message count.
7. `src/routes/sessions/$sessionId.tsx` — `enriched by …` badge.
8. New doc: `docs/reference/enrichment-sources.md`.
9. Update: `docs/explanation/sessions-vs-live.md` adds the "Two data planes" section.

**Ship criterion**: a session with `ENRICHMENT_SOURCE=teammate-analytics` configured shows the real Cosmos message count alongside the telemetry-derived turn count, with a visible "enriched by teammate-analytics" badge. With the env var unset, the page renders identically to today.

### Phase 3 — Inline context rendering (agentops side)

Self-contained, no Teammate dependency. Can ship before or after Phase 2 — they don't depend on each other.

1. `src/lib/conversation.ts` — add `context_injection` arm to `ConversationEvent`. Add classifier per the "Fix / Layer 1" rules above.
2. `src/lib/conversation.test.ts` — test fixtures using the `373be43b` chat-input shape and an additional case with a non-system inline injection (defensive default to bubble).
3. `src/components/conversation-view.tsx` — render the new arm via a `ContextInjectionPill` component. Indented under the preceding user bubble, muted, collapsible, token count visible.
4. `src/routes/sessions/-components/session-inspect/tree.tsx` — apply the same classification in `MessagesBlock` / `MessageCard` so the span-detail panel agrees with the conversation view.
5. New doc: `docs/explanation/conversation-view.md` documenting the three message kinds (user, assistant, context_injection).
6. Update: `docs/reference/ai-attributes.md` notes the inline-system-message pattern under `gen_ai.input.messages`.

**Ship criterion**: opening trace `373be43b-2e0a-4598-91ae-e680476ada96` in agentops shows one user bubble with a "Context injected: memory (N facts)" pill beneath it, expandable to see the full injected content. No duplicate-looking bubbles.

### Phase C — Adoption / cleanup (after Teammate Phase B + agentops Phase 2/3)

1. Verify no agentops session still relies on `CUSTOM_SESSION_ID_FIELDS=agentcontext_threadid` for grouping. Remove from `.env`.
2. Consider proposing `gen_ai.conversation.title` and `gen_ai.conversation.message_count` to the OTel semconv working group — if other vendors emit them too, agentops can drop the enrichment source for that subset of fields.
3. Consider proposing `gen_ai.input.message.kind` (or similar) to OTel — would let producers tag inline injections explicitly so Phase 3's heuristic classifier becomes an authoritative-attribute reader.

---

## Open questions

- **Which Teammate.Analytics endpoint exactly?** `GET /api/sessions/<id>/debug` returns the full payload (timeline included) which is heavier than we need. A dedicated `GET /api/sessions/<id>/enrichment` returning only the metadata fields would be faster and more honest about the contract. Recommend adding this endpoint to Teammate.Analytics and pointing the enrichment source at it.
- **Auth.** Teammate.Analytics is internal; agentops calling it cross-origin needs an auth story. CORS, shared cookie, internal-only deployment? Documented in `enrichment-sources.md`.
- **Where to draw the line between enrichment and "first-class second source."** Phase 2 surfaces metadata. If someone later wants the *actual messages* from Cosmos rendered in the Conversation view, that's a bigger feature — separate plan. Don't conflate.
- **Classifier robustness for inline injections.** Phase 3's heuristic is "system-role message that follows a user message in the array is an inline injection." That covers Teammate's `MemoryInjectionProvider` and similar middleware patterns, but a producer that puts the *primary* system prompt at the end of the array (unusual but legal) would be misclassified. Acceptable today; if a counterexample shows up, fall back to a producer-tagged attribute.
- **Backfill scope for the dedup leak.** Problem 4 stops the bleeding but doesn't reset existing inflated threads. Worth a separate ADR before running a Cosmos cleanup job.

---

## Why this is the right shape

- **Conventions fix isn't speculative.** `gen_ai.conversation.id` is published; agentops already reads it; Teammate just isn't emitting it yet. Pure correctness.
- **Enrichment isn't a hack.** It's the architecturally honest answer to "telemetry can't carry state." The interface is generic; the Teammate.Analytics implementation is one of many possible.
- **Inline context rendering isn't producer-side.** The producer is correctly carrying inline injected context inside `gen_ai.input.messages` — that's what the LLM saw. The bug is in agentops's renderer treating "everything in the array" the same way. Fix where the misrepresentation lives.
- **The dedup leak was hiding in plain sight.** The model-binding boundary silently dropped an id field that everything downstream depended on. Once named, the fix is two lines. The lesson: when a contract drops a field that a downstream invariant depends on, no amount of downstream cleverness can recover it.
- **All four layers stay focused.** Telemetry (events), enrichment (state), rendering (presentation), persistence integrity (data correctness). Documented, distinct, no overlap. Future readers understand the design.
- **agentops's identity survives.** Still a pure OTel reader for telemetry. Optional enrichment doesn't change that — it adds an *additional* data plane with its own clear contract. The rendering work is internal to how agentops presents OTel data. The dedup fix is entirely producer-side and doesn't touch agentops at all.

The 544-messages question gets the right answer: the number was *wrong* (caused by Problem 4), and once corrected the gap between telemetry's turn count and storage's message count becomes a manageable order-of-magnitude (~74 messages for 74 user turns, plus assistant + tool messages). The "two sets of messages" question gets the right answer: the data is faithful, the renderer is finally as smart about message kinds as the producer is. The "wrong key" question gets the right answer: standardized attributes everywhere, with the agentops `.env` cleanup that follows naturally from the producer change.
