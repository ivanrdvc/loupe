---
title: Detection and enrichment
type: explanation
summary: How loupe discovers new tools/agents and recovers truncated span
         attributes through two pluggable, read-triggered registries — and why
         the cursor gates scans instead of a background job.
status: stable
owner: "@ivan"
audience: loupe-devs
last-reviewed: 2026-06-06
tags: [detection, enrichment, telemetry, extensibility]
---

# Detection and enrichment

loupe surfaces two things that aren't in any single span: *which tools and
agents are new*, and *the full body of an attribute the backend truncated*.
Both are computed against the active telemetry provider, both ship with an
upstream default, and both expose a registry a fork can extend at boot without
editing tracked files. This doc explains the data flow and the one design
choice that matters: detection is gated by a cursor, not driven by a timer.

## The shape of the problem

Telemetry providers are expensive and lossy. App Insights / Cosmos clamp large
attribute strings (~8 KB), so `toolResult`, `llmInput`, and friends can arrive
truncated. And the providers bill by query, so any scan that runs on every page
render — or sweeps 30 days at once — burns RU fast. The original detection did
both: it fired from the home loader on a query that refetches every 30s, and
its first scan reached back 30 days. A left-open dashboard quietly hammered the
provider.

Reads (the bell, the home widget) and detection (scanning the provider) were
the same call. The fix is to split them and bound the scan.

## How it works

### Detection

Detection finds new tools/agents and writes them to the `inventory` and
`inbox_item` tables (`src/server/detection/index.ts`). **Reads never trigger a
scan** — the bell and widget only `SELECT` from SQLite.

`runDetection(kind)` is the unit of work: idempotent, overlap-guarded (an
in-memory `running` set), and forward-only. The `discovery_cursor` row does
double duty — it's both the gate (skip if the last scan was under
`DETECTION_INTERVAL_MS` ago, default 60 min) and the window start (scan
`[lastScannedAt, now]`). On a fresh cursor the first scan is bounded to
`FIRST_SCAN_MS` (1 h); there is no history backfill. `inbox_item.firedAt` is
stamped with the observation's event time, not wall-clock, so an old tool
discovered today doesn't masquerade as just-happened.

The cursor *is* the scheduler. There's no timer, no cron, no endpoint — a
boot `setInterval` would be a per-instance side-effect with no lifecycle, and
TanStack Start's native primitive is the server function. So detection stays a
server fn piggybacking on dashboard reads, throttled to one bounded scan per
interval. Net effect: at most one scan per interval while the app is in use,
and zero provider traffic when nobody's looking.

Where observations come from is pluggable (`src/server/detection/source.ts`):

```ts
import { registerDetectionSource } from '#/server/detection/source'
registerDetectionSource({
  name: 'cosmos',
  discover: async (kind, window) => /* Observation[] (claims) | null (abstains) */,
})
```

Forks register ahead of the default provider scan; the first source returning
non-null wins. A Cosmos-backed fork claims every kind and loupe never queries
the provider for it.

### Enrichment

When a span attribute is truncated, `classify-span.ts` flags it
(`truncatedAttrs`). The UI (`truncated-attr-fallback.tsx`) then calls
`resolveTruncatedAttr`, which walks the enrichment registry
(`src/features/inspect/server/enrich-span.ts`):

```ts
import { registerEnrichmentSource } from '#/features/inspect/server/enrich-span'
registerEnrichmentSource({
  name: 'cosmos',
  resolve: async (req) => /* full JsonValue | string | null */,
})
```

First non-null wins. With no source registered, the UI shows a static
"telemetry truncated at ~8 KB" note rather than a broken value.

## Trade-offs and non-goals

- **Forward-only, read-triggered.** Detection advances only while the app is in
  use, and an event ingested late with a timestamp before the cursor can be
  missed. We accept this: it's the price of never polling Cosmos on idle and
  never doing a history sweep. Latency on "new tool" alerts doesn't matter;
  RU does.
- **No background worker.** Cheaper and simpler than a timer for a single-process
  local dashboard. A fork that *does* have a job runner drives `runDetection`
  (exported, idempotent) from its own pipeline.
- **`firedAt` = event time** so the bell sorts by when things happened, not when
  we noticed.

## Open questions

- <TODO: should `DETECTION_INTERVAL_MS` scale with the active time range, or stay
  a flat global?>
