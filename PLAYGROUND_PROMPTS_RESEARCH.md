# Playgrounds & Prompts — competitor research

How Langfuse and Phoenix do **Playground**, **Prompts**, and how they tie into traces + notes. Compiled to decide what agentops should ship and in what order.

---

## 1. Playground

### Langfuse
- Chat-shaped single-turn sandbox: system + messages array, variables, tools (JSON schema), structured-output schema.
- Providers are **BYO-key** in project settings — not gated, not curated.
- **Killer integration: "Open in Playground" button on every generation span.** One click from a production trace into an editable replay. Pre-fills messages/model/tools/temperature from the span.
- **"Save to Prompt Management"** writes the edited prompt back to the registry as a new version. Playground is the on-ramp into the prompt registry, not a separate scratch pad.
- Tool-call replay only works cleanly when tools are in OpenAI ChatML format. Anthropic-native tool blocks and Gemini function-calling shapes break the replay. Real limitation given multi-provider traffic.
- Multi-turn and multimodal are not documented.
- Source: https://langfuse.com/docs/playground

### Phoenix
- Up to 4 instances **side-by-side** in one view (`NUM_MAX_PLAYGROUND_INSTANCES = 4`). Designed for A/B comparison, not single-prompt iteration.
- Providers: OpenAI, Anthropic, Gemini, Azure, custom endpoints. Tools (`PlaygroundTool.tsx`, `JSONToolEditor`), structured output (`PlaygroundResponseFormat.tsx`). Multimodal not confirmed in fetched docs.
- **Span replay confirmed:** dedicated `SpanPlaygroundPage` (`app/src/pages/playground/SpanPlaygroundPage.tsx`) reached from the trace view. `transformSpanAttributesToPlaygroundInstance(span)` hydrates messages/model/tools from OpenInference attrs. Banner: "LLM Span Replay — Replay and iterate on your LLM call from {project}" with a "Back to Trace" button. Parsing errors surfaced as a warning banner when attributes don't fully map.
- Every playground run **is itself recorded as a trace** — closes the loop.
- Self-hosted only. Disabled if no LLM provider client is installed on the server (`NoInstalledProvider.tsx`).
- Sources: https://arize.com/docs/phoenix/prompt-engineering/overview-prompts/prompt-playground, https://github.com/Arize-ai/phoenix/blob/main/app/src/pages/playground/SpanPlaygroundPage.tsx

### Verdict for agentops
- Ship **span → "Open in Playground"** as the headline feature. Both competitors have it; without it, the playground is a toy.
- Phoenix's 4-up side-by-side is the differentiator worth stealing if we want to be opinionated about evals.
- BYO-key is correct. Don't curate a model list.
- Playground runs should themselves be traces in our local DB.

---

## 2. Prompts (registry / management)

### Langfuse
- Two prompt types fixed at creation: **text** vs **chat**. Immutable — annoying papercut.
- `{{variable}}` templates compiled at runtime.
- **Labels are the deployment primitive, not version numbers.** SDK calls `getPrompt("greeter")` → fetches latest with `production` label. Promotion = relabel. Rollback = relabel.
- Client-side **cache + background revalidation** in SDKs. Prompts treated as config.
- **Fallback prompt baked into the SDK call** — if Langfuse is down the app still runs. Docs explicitly state: "if fallback is used, no link will be created" — so the trace correctly reflects "ran without registry."
- Generations carry `prompt=` parameter that links a specific version to the span → per-version cost/latency/score metrics on the prompt's own page.
- Frameworks (Langchain, Vercel AI) attach `langfuse_prompt` metadata automatically.
- **Protected Prompt Labels** (EE-only): RBAC on who can move `production`.
- Sources: https://langfuse.com/docs/prompts/get-started, https://langfuse.com/docs/prompt-management/features/link-to-traces

### Phoenix
- "Prompt Hub" stores a **full snapshot** per version — template + invocation params + tools + response-format schema. Versioned like git commits.
- Movable string tags (`production`, `staging`, custom) for environment-based deploys.
- Templates support **both F-string `{var}` and Mustache `{{var}}`** with nested access.
- Chat and completion both supported; tool definitions and structured-output JSON schemas live inside the prompt version.
- SDK fetches `(id, tag)`, formats client-side, passes into the provider's own SDK call.
- **Soft spot: no documented automatic `prompt_id/version_id` span attribute** when a managed prompt is used at runtime. The relationship is human-driven (extract span → make a prompt) rather than automatic forward-link.
- **Experiments**: run prompt version × dataset, score via LLM-as-judge or human annotations, compare side-by-side.
- Sources: https://arize.com/docs/phoenix/prompt-engineering/concepts-prompts/prompts-concepts

### Verdict for agentops
- **Steal labels-as-deployment from Langfuse.** It generalizes to staging/canary/per-tenant without schema changes; "active version" booleans don't.
- **Steal full-snapshot versioning from Phoenix.** A prompt version is template + params + tools + schema — a self-contained contract. Langfuse splits these across prompt + playground/experiment configs, which is worse.
- **Beat both on prompt↔trace linkage.** Phoenix lacks it; Langfuse has it but requires SDK cooperation. Since agentops is read-only telemetry, our link can be a UI-side fuzzy match (prompt-version body hash ↔ span input messages) — works even if the user's app doesn't know about agentops.
- Ship fallback-on-network-failure in the SDK from day one. Don't make production apps depend on our uptime.

---

## 3. Notes (covered separately in the notes plan, summarized for the tie-in story)

### Langfuse — Comments
- Polymorphic on `(objectType, objectId)` — traces, observations, sessions, **prompts**. One table, four entity types.
- Markdown, **@mentions trigger email**, emoji reactions, flat chronological thread.
- **Text-anchored comments** in JSON view: highlight a substring inside a span's input/output, anchor a comment there. Anchors can go "detached" if data changes — pragmatic.
- No replies, no resolve/unresolve, no in-app notification center surfaced in docs (email only).
- Sources: https://langfuse.com/docs/observability/features/comments

### Phoenix — Notes
- Spans + traces only. **No session notes.**
- Reserved annotation slot: name `"note"` rejected by generic annotation endpoints; dedicated `POST /v1/span_notes`, `POST /v1/trace_notes`.
- Chat-bubble UI (`MessageBubble` + `MessageBar`), auto-scroll, hotkey `n` to open. Multi-user attribution (createdAt + username + avatar).
- Append-only (UUIDv4 per note, no overwrite). No markdown, no edit history.
- **Design framing worth stealing:** *"Notes are the pre-rubric surface; annotations are the post-rubric record."* Open coding for reviewers before any structured scoring exists; later distilled into labels/scores.
- Sources: https://arize.com/docs/phoenix/release-notes/04-2026/04-24-2026-trace-notes-api, https://arize.com/docs/phoenix/release-notes/12-2025/12-09-2025-span-notes-api

### Verdict for agentops
- Polymorphic table from Langfuse is the right schema (already in the notes plan).
- **Markdown from Langfuse, multi-instance/append-only from Phoenix.** Both, not either.
- **Session notes are a real differentiator** — Phoenix doesn't have them.
- The "pre-rubric inbox / post-rubric record" framing is the clearest way to explain why notes and annotations stay separate.

---

## The integration loop (what to design together)

Both competitors converge on the same loop. Don't build the three features as islands.

```
                      ┌──────────────────────────────────────────┐
                      │                                          │
                      ▼                                          │
   production trace ──► "Open in Playground" ──► edit ──► "Save as new prompt version"
                      │                                          │
                      │                                          ▼
                      │                              relabel `production`
                      │                                          │
                      │                                          ▼
                      │                              next traces auto-link to v(N+1)
                      │                                          │
                      │                                          ▼
                      │                              Experiments compare v(N) vs v(N+1) on a dataset
                      │                                          │
                      │                                          ▼
                      │                              Annotations/Scores judge them
                      │                                          │
                      └──────────────────────────────────────────┘
                              ▲
                              │
   Notes are the human-discussion thread that runs alongside the entire loop,
   attached to any entity (trace / session / span / prompt / experiment).
```

### What this means for the agentops notes plan

The current notes plan is good as-is, but **extend the polymorphic targets now to include `prompt` and `experiment`**, even if those features ship later. Same migration, free option value. The plan's polymorphic schema `(target_kind, target_id)` already supports this — just widen the enum:

```ts
targetKind: text('target_kind', {
  enum: ['session', 'trace', 'span', 'prompt', 'experiment'],  // add prompt/experiment
}).notNull(),
```

That single line is the entire "tie them together" decision at the data layer.

### Sequencing recommendation

1. **Notes** (planned). Ship with the wider enum above. ~2-3 days.
2. **Prompts registry** without runtime SDK cooperation. Read-only at first — manually paste a prompt, version it, label it. UI-side match against span inputs to display "this trace looks like prompt foo v3". ~1 week.
3. **Playground** as a span-replay surface. Hydrate from OpenInference attrs (`gen_ai.prompt.*`, `gen_ai.completion.*`). BYO-key in localStorage. Output is itself written to local DB as a trace. ~1-2 weeks.
4. **Playground ↔ Prompts**: "Save as new prompt version" button. Closes the loop.
5. **Experiments / annotations** — separate plan, but design the notes/prompts schemas now so they slot in without migration.

### What NOT to copy

- Langfuse's immutable text-vs-chat prompt type. Just store everything as chat, with single-message degenerate case for "text".
- Phoenix's no-markdown notes. We already have a `Markdown` component; use it.
- BYO-key only at "project settings" level (Langfuse). For a local-only tool, keys belong in localStorage, not a settings page.
- @mention email notifications (Langfuse). Single-author install — irrelevant for v1.
