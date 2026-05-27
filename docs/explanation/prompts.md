---
title: Prompts workbench
type: explanation
summary: Folder tree of editable prompt snippets that run against a configured agent endpoint.
status: draft
owner: "@ivan"
audience: loupe-devs
last-reviewed: 2026-05-24
tags: [prompts]
---

# Prompts workbench

`/prompts` is a folder tree of editable snippets. Click one to open the playground at `/prompts/$promptId`: edit messages, model params, tools, response format. Save creates a new version (history is immutable). Run POSTs the current messages to your agent and shows the response.

## Data

Three SQLite tables in `src/db/schema.ts` — `prompt_folder` (self-referential, `kind: 'user' | 'system'`), `prompt`, `prompt_version` (full snapshot per version). System folders are seeded once and protected from delete/edit.

Server fns in `src/server/prompts.ts` follow the `src/server/notes.ts` pattern. `ensureSeed()` and `createVersion` both run inside `db.transaction` — no half-seeded DB, no race on `max(version)+1`.

## Live-run

`runLivePrompt` in `src/server/prompt-run.ts` POSTs to a user-supplied URL in the OpenAI Responses API shape:

```
POST <endpointUrl>
{ "model": "...", "input": [{ role, content }, ...], "metadata": { "entity_id": <agentName> } }
```

Runs server-side (browser CORS doesn't apply). 60s timeout via `AbortSignal.timeout`. Any http(s) URL is allowed — local or remote.

## Config

Two env vars pre-fill the Endpoint and Agent inputs on the playground:

- `PROMPT_LIVE_ENDPOINT` — e.g. `http://localhost:8080/v1/responses`
- `PROMPT_LIVE_AGENT` — e.g. `ProverbsAgent`

Editing the inputs persists per browser via localStorage and takes precedence.
