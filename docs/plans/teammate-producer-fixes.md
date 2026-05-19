---
title: Teammate producer-side fixes
type: plan
summary: All Teammate-side work referenced by the main conventions /
         conversation-truth plan, broken out so it can be handed off to
         the Teammate.Api / Teammate.Agent.UI maintainers as a self-contained
         set of changes. Two distinct fixes: (1) align OTel emission with
         published conventions, (2) close the dedup leak that re-persists
         every replayed message because the inbound contract drops the
         AG-UI message id.
status: proposed
owner: "@ivan"
audience: teammate-service-devs, teammate-ui-devs
last-reviewed: 2026-05-19
tags: [teammate, otel, persistence, conventions, dedup]
related:
  - conventions-and-conversation-truth.md
---

# Teammate producer-side fixes

This document collects every change required on the Teammate side
(`Teammate.Api`, `Teammate.Agent.UI`) to address two producer-side issues
flagged from agentops:

1. **Conventions** — Teammate emits non-standard / accidental keys for the
   conversation id and doesn't carry an explicit OpenInference span kind.
   Any standards-compliant OTel reader (agentops, Phoenix, Langfuse, generic
   OTel UIs) is therefore one step further from rendering Teammate sessions
   correctly than it has to be.

2. **Dedup leak in `TeammateChatMessageStore`** — the inbound
   `ChatRequestMessage` contract has no `Id` field, so the AG-UI / CopilotKit
   message id is silently dropped at the model-binding boundary. Downstream
   `AssignMissingMessageIds` assigns a fresh GUID per call, defeating
   `FilterNewMessages`. Result: every replayed message is re-persisted as
   "new," inflating Cosmos by an order of magnitude.

Both are entirely producer-side. agentops will look more correct after these
land, but no agentops code change is required for either. Each fix and its
phase are reproduced from `conventions-and-conversation-truth.md` so this
file is self-contained for hand-off.

---

## Fix 1 — OTel conventions

### What's wrong

| Concept | What Teammate emits today | What the convention is |
|---|---|---|
| Conversation / session id | `ag_ui.thread_id`, `agentcontext.threadid` | `gen_ai.conversation.id` (OTel GenAI semconv) |
| Conversation title | `ag_ui.thread_title` | No published convention; AG-UI key is de-facto. Keep. |
| Span role (agent / tool / LLM) | Inferred from operation name | `openinference.span.kind = AGENT \| TOOL \| LLM \| CHAIN \| RETRIEVER` (Phoenix / Arize) — optional but widely-adopted cross-tool signal |
| User id / name | `user.id`, `user.name` | Same. Already correct. |
| Agent id / name / description | `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.agent.description` | Same. MEAI emits these correctly. |
| Operation purpose (title gen, …) | `teammate.llm.purpose` | No convention. App-namespaced is fine. |

The non-standard keys aren't wrong in absolute terms — agentops happens to
read them via the `CUSTOM_SESSION_ID_FIELDS` config. They become a problem
the moment anything else has to read this telemetry: a tool swap, a vendor
evaluation, a post-mortem with someone unfamiliar with the deployment.

### Task 1.1 — Emit `gen_ai.conversation.id` at every thread-id site

Add a single helper in `Teammate.Shared/Infrastructure/Telemetry/TelemetryHelper.cs`:

```csharp
/// <summary>
/// Stamps the conversation thread id on the current Activity using both the
/// OTel-standard key (`gen_ai.conversation.id`) and the AG-UI ecosystem
/// alias (`ag_ui.thread_id`). Use this anywhere a thread id is available —
/// HTTP middleware, scheduled jobs, dashboard generation — so session
/// grouping is consistent across all trigger paths.
/// </summary>
public static void SetConversationId(string? threadId)
{
    if (string.IsNullOrEmpty(threadId)) return;
    SetTelemetryValue(threadId, "gen_ai.conversation.id");
    SetTelemetryValue(threadId, "ag_ui.thread_id");
}
```

Then update the five emission sites:

| # | File | Line | Today | Change |
|---|---|---|---|---|
| 1.1.a | `src/Teammate.Service/Features/Threads/Middleware/AguiThreadContextMiddleware.cs` | 78 | `TelemetryHelper.SetTelemetryValue(agentContext.ThreadId);` — emits accidental `agentContext.ThreadId` key via `[CallerArgumentExpression]` | Replace with `TelemetryHelper.SetConversationId(agentContext.ThreadId);` |
| 1.1.b | `src/Teammate.Service/Features/CommandCenter/Services/AgentPromptService.cs` | 131 | `["ag_ui_thread_id"] = threadId` in `AdditionalProperties` | Keep the `AdditionalProperties` entry (it flows through `OpenTelemetryChatClient`) **and** add `TelemetryHelper.SetConversationId(threadId)` on the activity wrapping the call so the standard key is on the parent activity too |
| 1.1.c | `src/Teammate.Service/Infrastructure/Telemetry/OpenTelemetryExtensions.cs` | 82 | `activity.SetTag(SchedulingDiagnostics.ActivityTags.ThreadId, threadId)` (only `scheduling.thread_id`) | Add `TelemetryHelper.SetConversationId(threadId)` alongside — keep `scheduling.thread_id` (it's referenced elsewhere as the scheduling-specific name) |
| 1.1.d | `src/Teammate.Shared/Features/Scheduling/Tools/JobChainTools.cs` | 72 | Same as 1.1.c | Same as 1.1.c |
| 1.1.e | `src/Teammate.Shared/Features/Scheduling/Tools/TaskSchedulingTools.cs` | 82, 154 | Same as 1.1.c | Same as 1.1.c |

**Why scheduling tags get the same treatment.** The comment at
`OpenTelemetryExtensions.cs:79` is explicit — `scheduling.thread_id` *is* the
conversation thread id, used for cross-trace correlation between scheduling
and execution. Without `gen_ai.conversation.id` on these spans, scheduled
background runs would be invisible in agentops's session grouping. They'd
show up as orphan traces instead of nested under their originating
conversation.

**Why both keys.** agentops reads both. Phoenix / Langfuse / generic OTel UIs
only know the standard key. AG-UI-specific tooling looks for
`ag_ui.thread_id`. Cost is ~30 bytes per span; buys cross-ecosystem grouping.

**Verification (App Insights KQL):**

```kusto
union dependencies, requests
| where timestamp > ago(1h)
| where customDimensions has "gen_ai.conversation.id"
| summarize traces=dcount(operation_Id), spans=count() by tostring(customDimensions["gen_ai.conversation.id"])
| top 10 by spans desc
```

If the new sessions show up grouped correctly, Task 1.1 is done.

### Task 1.2 — Drop the accidental `agentcontext.threadid` key

The pre-1.1.a call `TelemetryHelper.SetTelemetryValue(agentContext.ThreadId)`
(no explicit key) emitted under the C# variable name via
`[CallerArgumentExpression]`. After 1.1.a it's gone from the middleware.

Verify no downstream consumer still filters on it:

```bash
grep -rn "agentcontext\.threadid\|agentcontext_threadid" \
    ~/dev/Teammate.Api ~/dev/Teammate.Analytics ~/dev/Teammate.Agent.UI
```

agentops still reads it (via `CUSTOM_SESSION_ID_FIELDS=agentcontext_threadid`
in its `.env`) so during the deploy window everything keeps grouping
correctly. **Once Task 1.1 has been live long enough for the longest open
session to be flushed**, remove the agentops config:

```diff
- CUSTOM_SESSION_ID_FIELDS=agentcontext_threadid
```

`gen_ai.conversation.id` is already in agentops's `SESSION_ATTR_KEYS` list;
nothing else to change there.

### Task 1.3 — Stamp `openinference.span.kind` on agent / tool / chat activities

This is broader because it touches multiple activity types. The idiomatic
place is an `ActivityListener` registered at app startup that maps operation
names to span kinds.

New file `src/Teammate.Service/Infrastructure/Telemetry/OpenInferenceKindEnricher.cs`:

```csharp
using System.Diagnostics;

namespace Teammate.Service.Infrastructure.Telemetry;

/// <summary>
/// Stamps `openinference.span.kind` on agent / tool / LLM activities so
/// OpenInference-compatible readers (Phoenix, some Langfuse modes) can
/// render the trace correctly without span-name inference. Honors the
/// `gen_ai.*` operation name when present, falls back to span-name prefix
/// matching.
/// </summary>
public static class OpenInferenceKindEnricher
{
    public static void Register()
    {
        ActivitySource.AddActivityListener(new ActivityListener
        {
            ShouldListenTo = _ => true,
            Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStarted = activity =>
            {
                if (activity.GetTagItem("openinference.span.kind") != null) return;

                var op = activity.GetTagItem("gen_ai.operation.name") as string;
                var kind = op switch
                {
                    "chat" => "LLM",
                    "execute_tool" => "TOOL",
                    "invoke_agent" => "AGENT",
                    "create_agent" => "AGENT",
                    "embeddings" => "EMBEDDING",
                    _ => null,
                };

                kind ??= activity.OperationName switch
                {
                    var n when n?.StartsWith("invoke_agent ") == true => "AGENT",
                    var n when n?.StartsWith("execute_tool ") == true => "TOOL",
                    var n when n?.StartsWith("chat ") == true => "LLM",
                    _ => null,
                };

                if (kind is not null) activity.SetTag("openinference.span.kind", kind);
            },
        });
    }
}
```

Wire it in `Program.cs` after the OTel registration:

```csharp
OpenInferenceKindEnricher.Register();
```

**Verification:**

```kusto
union dependencies, requests
| where timestamp > ago(1h)
| where customDimensions has "openinference.span.kind"
| summarize cnt=count() by tostring(customDimensions["openinference.span.kind"])
```

Should produce rows for `LLM`, `TOOL`, `AGENT`, optionally `EMBEDDING`.

### What's deliberately not in Fix 1

- **Inline injected-context tagging.** No OTel convention exists for "this
  message in the array is inline context vs. a real turn." If
  `gen_ai.input.message.kind` lands upstream, revisit. Until then, agentops
  classifies heuristically on the reader side.
- **Message count, user message count, etc.** Storage facts, not telemetry
  facts. Surfaced in agentops via the enrichment source described in the
  parent plan, not by adding new emission keys.
- **`gen_ai.conversation.title`.** Not a published convention.
  `ag_ui.thread_title` stays the de-facto key.

---

## Fix 2 — Dedup leak in `TeammateChatMessageStore`

### Symptom

For session `1ebfaf20-eec4-422d-9c41-15ddd6d4901b`, Cosmos holds 87 user-role
message documents across only **17 distinct content strings**:

| Content (truncated) | Stored copies |
|---|---|
| "How to configure my router? Use Search Knowledge base tool to get response." | 34 |
| "what is direct deposit?" | 24 |
| "what is direct deposit? Use Search Knowledge base tool to get response" | 8 |
| "How do I set up direct deposit for employees?" | 6 |
| (other questions) | 1–2 each |

Each is a user message the actual user typed *once*, then re-persisted on
every subsequent turn.

### Why this is happening — chain of loss

CopilotKit *does* attach stable ids to every message. Direct evidence:
`AguiThreadContextMiddleware.GetLatestUserMessage` reads `id` from the
request body, and `ValidateReceipt` requires it to be non-empty. So inbound
ids exist in the request JSON.

The loss happens at model binding:

1. **CopilotKit (Teammate.Agent.UI)** sends
   `{ "id": "msg_abc", "role": "user", "content": "...", ... }` per
   message. ✓
2. **Middleware** parses raw JSON for receipt validation, sees the id. ✓
3. **Model binding** to `ChatRequest` discards the id because
   `ChatRequestMessage` (record at
   `Teammate.Shared/Features/Chat/Contracts/ChatRequest.cs:10`) declares
   only `Role`, `Text`, `CreatedAt`, `Attachments` — **no `Id` field**.
   System.Text.Json silently drops the unknown property. ❌
4. **`ChatRequestExtensions.ToChatMessages`** constructs
   `new ChatMessage(role, contents)` — nothing to pass for `MessageId`
   because step 3 already discarded it.
5. **`TeammateChatMessageStore.AssignMissingMessageIds`** (line 497) sees
   `MessageId == null` and assigns `Guid.NewGuid().ToString("N")` — a fresh
   GUID on every replay.
6. **`FilterNewMessages`** (line 294) compares the new GUID to
   `existingIds`, finds no match (because last turn's GUID was different),
   persists the message again.

The dedup logic is correct; the data it operates on is corrupted upstream.
A contract bug, not a logic bug.

### Task 2.1 — Add `Id` to the contract

**File:** `src/Teammate.Shared/Features/Chat/Contracts/ChatRequest.cs`

```csharp
public record ChatRequestMessage(
    string Role,
    string Text,
    DateTime CreatedAt,
    string? Id = null,                          // ← NEW
    List<AttachmentInfo>? Attachments = null
);
```

ASP.NET's default JSON options match camelCase request property `id` to
record property `Id` automatically. If your services explicitly configure
strict casing, add `[JsonPropertyName("id")]` to be safe.

### Task 2.2 — Pass it through in `ToChatMessages`

**File:** `src/Teammate.Service/Features/Chat/Extensions/ChatRequestExtensions.cs`

```csharp
// Before
chatMessages.Add(new ChatMessage(role, contents));

// After
chatMessages.Add(new ChatMessage(role, contents) { MessageId = message.Id });
```

That restores the original dedup contract: `FilterNewMessages` sees the same
stable id on every replay and correctly skips it.

### Task 2.3 — Defense-in-depth: deterministic fallback in `AssignMissingMessageIds`

Tasks 2.1 + 2.2 handle every CopilotKit message (always has an id). They do
*not* help if some other ingest path (an internal job, a test, a different
client) constructs `ChatMessage` objects without ids and feeds them to the
store. Replace the GUID fallback with a deterministic hash.

**File:** `src/Teammate.Service/Features/Threads/Persistence/TeammateChatMessageStore.cs` (line 497)

```csharp
private static void AssignMissingMessageIds(IEnumerable<ChatMessage> messages, ILogger? logger = null)
{
    foreach (var message in messages)
    {
        if (!string.IsNullOrEmpty(message.MessageId)) continue;

        var resultContent = message.Contents.OfType<FunctionResultContent>().FirstOrDefault();
        if (resultContent?.CallId is not null)
        {
            message.MessageId = $"result_{resultContent.CallId}";
            continue;
        }

        // Deterministic fallback so replays dedup correctly. CopilotKit
        // normally provides stable ids; this path catches non-CopilotKit
        // sources and warns so we can find and fix them.
        var text = string.Join("\n", message.Contents.OfType<TextContent>().Select(t => t.Text ?? ""));
        var hash = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes($"{message.Role}:{text}"))
        )[..16].ToLowerInvariant();
        message.MessageId = $"derived_{hash}";

        logger?.LogWarning(
            "Assigned derived id to message without stable id (role={Role}). " +
            "Producer should set MessageId upstream.",
            message.Role);
    }
}
```

The `derived_*` prefix makes these visible in queries and dashboards so leak
sources can be tracked down.

### Task 2.4 — Tests

`Teammate.Service.Tests` (or wherever the message-store tests live):

```csharp
[Fact]
public async Task PersistsTurnHistory_DoesNotDuplicate_OnReplay()
{
    var threadId = Guid.NewGuid().ToString();
    var userMsg = new ChatMessage(ChatRole.User, "How do I set up direct deposit?") { MessageId = "msg_1" };
    var assistantMsg = new ChatMessage(ChatRole.Assistant, "Here's how...") { MessageId = "chatcmpl_1" };

    // Turn 1: persist both
    await _store.SaveAsync(threadId, [userMsg, assistantMsg], ...);

    // Turn 2: client replays history + new user message
    var newUserMsg = new ChatMessage(ChatRole.User, "What about for contractors?") { MessageId = "msg_2" };
    await _store.SaveAsync(threadId, [userMsg, assistantMsg, newUserMsg], ...);

    // Cosmos should have 3 messages, not 5
    var stored = await _store.GetMessagesAsync(threadId, ...);
    Assert.Equal(3, stored.Count);
}

[Fact]
public void AssignMissingMessageIds_GeneratesDeterministicId_ForMessagesWithoutId()
{
    var m1 = new ChatMessage(ChatRole.User, "test");
    var m2 = new ChatMessage(ChatRole.User, "test");

    AssignMissingMessageIds([m1]);
    AssignMissingMessageIds([m2]);

    Assert.StartsWith("derived_", m1.MessageId);
    Assert.Equal(m1.MessageId, m2.MessageId);
}
```

The first test would have failed before Tasks 2.1 + 2.2. The second guards
the hash-fallback.

### Task 2.5 — Backfill ADR

The 544 messages already in Cosmos for `1ebfaf20-...` (and however many
other threads are affected) won't fix themselves. Options:

- **Leave them.** Bug stops growing. Historical analytics overcounts but the
  live system is correct. Minimum effort.
- **One-off dedup job.** For each thread, group user-role messages by
  `(role, text content)`, keep the earliest by `createdAt`, mark the rest
  for deletion or move to `messages_deleted`. Be conservative: skip
  messages whose `MessageId` doesn't match the random-GUID pattern
  (`^[a-f0-9]{32}$`) — those have stable ids and are *not* duplicates. Also
  skip tool/assistant rows on the first pass; they're correctly dedup'd.

Recommendation: run the one-off job restricted to user-role +
random-GUID-format `MessageId`. Low risk, high data-quality payoff.
Document the decision in a short ADR before any data is touched.

### Teammate.Agent.UI — verified, no change needed

The dedup leak does **not** require any UI-side change. The fix is entirely
in `Teammate.Api`. Evidence:

- The `backend/thread-agent-runner.js` replay path uses `msg.id` from the
  .NET API when reconstructing AG-UI events for CopilotKit rehydration —
  ids round-trip correctly.
- CopilotKit's own runtime assigns and propagates message ids per the AG-UI
  protocol; nothing in `Teammate.Agent.UI` strips them.
- The receipt validation in `AguiThreadContextMiddleware` proves ids arrive
  at the .NET side — they're just dropped during model binding to
  `ChatRequestMessage`, not before.

Document this explicitly so a future investigator doesn't go hunting in the
UI repo for a bug that isn't there.

---

## Phases

Both fixes are Teammate-side and can ship independently. Fix 2 is the most
user-impactful and the smallest — recommend shipping it first.

### Phase A — Fix 2 (dedup leak)

1. **Task 2.1** — Add `Id` to `ChatRequestMessage`. One-line record change.
2. **Task 2.2** — Pass it through in `ToChatMessages`. One-line property
   initializer.
3. **Task 2.3** — Replace `Guid.NewGuid()` fallback with deterministic
   SHA256 hash. Log warning when fallback fires.
4. **Task 2.4** — Add the two unit tests.
5. **Task 2.5** — Write a short ADR documenting the backfill decision
   (run the dedup job, or leave historical data alone).

**Ship criterion**: send the same user message three turns in a row. Cosmos
has one row, not three. `derived_*`-prefixed messages don't appear in normal
traffic (only fallback path).

### Phase B — Fix 1 (conventions)

1. **Task 1.1** — Add `TelemetryHelper.SetConversationId` helper. Update all
   five emission sites (`AguiThreadContextMiddleware.cs:78`,
   `AgentPromptService.cs:131`, `OpenTelemetryExtensions.cs:82`,
   `JobChainTools.cs:72`, `TaskSchedulingTools.cs:82, 154`).
2. **Task 1.2** — Verify nothing else filters on `agentcontext.threadid`.
   After deploy bake-in, coordinate with agentops to remove the
   `CUSTOM_SESSION_ID_FIELDS` entry from its `.env`.
3. **Task 1.3** — Register `OpenInferenceKindEnricher` ActivityListener in
   `Program.cs`.
4. **Sanity check** — Run the verification KQL queries. Confirm new
   attributes are present on recent spans.

**Ship criterion**: a brand-new session emits `gen_ai.conversation.id` on
every span (including scheduled-task spans), and `openinference.span.kind`
on agent / tool / chat activities. Existing readers continue to work
unchanged because the old keys are still emitted during the bake-in window.

---

## Open questions

- **Backfill scope.** Should we run a Cosmos dedup job to clean historical
  threads, or accept the inflation? Recommend: one-off job restricted to
  user-role + 32-hex-char `MessageId` pattern. Out of scope of the code fix.
- **Coordination with agentops `.env` cleanup.** After Phase B Task 1.1
  bakes in, agentops can drop the `CUSTOM_SESSION_ID_FIELDS` entry. Worth a
  short cross-team handoff note so this doesn't get forgotten.
- **JsonPropertyName on `Id`.** Default ASP.NET JSON options should bind
  `id` → `Id` case-insensitively. If your services configure strict casing
  (`PropertyNameCaseInsensitive = false`), add `[JsonPropertyName("id")]`
  to the contract.

---

## Why this is the right shape

- **Both fixes are localized.** Each is a small handful of files; reviewers
  can audit the diffs without context.
- **No agentops dependency.** Phase A and Phase B can ship and bake in
  before agentops touches its config; agentops's cleanup is a follow-up,
  not a blocker.
- **The dedup leak is a contract bug, not a logic bug.** Once named, it's
  obvious in hindsight: a model boundary silently dropped a field that
  every downstream invariant depended on. Adding the field at the boundary
  is the structural fix; the hash-fallback is belt-and-suspenders for
  non-CopilotKit producers.
- **Conventions are additive.** Old keys keep working through the deploy
  window. Anything that was reading them keeps reading them. The
  agentops-side cleanup is opt-in.

---

## Related

- Parent plan: [conventions-and-conversation-truth.md](conventions-and-conversation-truth.md)
  — covers the agentops-side rendering and enrichment work that complements
  these Teammate-side fixes.
