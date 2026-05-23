---
title: Tasks
type: explanation
summary: What the Tasks page shows — machine-driven agent runs (scheduled, event,
  webhook, background) rolled up by task identity.
status: draft
owner: "@ivan"
audience: agentops-devs
last-reviewed: 2026-05-23
tags: [tasks, otel, telemetry]
---

# Tasks

A view over fires — individual executions of machine-driven agent runs. Each row in the table is a task definition; the count column is how many times it fired in the window.

Same posture as the rest of agentops: read-only over OTel, no local mirror, no provider-specific code. The Tasks page is a different query shape over the existing `TelemetryProvider`, not a new backend.

## Where a fire comes from

A fire is any root trace whose category is `scheduled`, `event`, `webhook`, or `background`. These four buckets are read off the root span's `session.trigger_type` (plus `session.execution=background` when `trigger_type=user` for the background bucket) by `classifyTraceCategory` in [`src/lib/telemetry/trace-category.ts`](../../src/lib/telemetry/trace-category.ts).

## OTel attributes the Tasks UI reads

The reference table in [ai-attributes.md → Triggers & tasks](../reference/ai-attributes.md#triggers--tasks) is the source of truth. Below is what each attribute is *used for* on this page specifically.

### Stamped on the root span by the producer

| Attribute              | Used for                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `session.trigger_type` | Bucket selection (`scheduled` / `event` / `webhook` / `background`-when-`user`). Drives the trace category that filters fires. |
| `session.execution`    | Set to `background` alongside `trigger_type=user` to land in the `background` bucket. Ignored otherwise.                  |
| `task.id`              | Primary identity key — fires of the same task collapse into one row. Without it, the row falls back to the derived key.   |
| `task.kind`            | `cron` / `one_shot` / `event` / `webhook` / `background`. Drives the Kind badge + the cadence inference on the detail hero. |
| `task.schedule`        | Cron expression, ISO due-at, or interval. Shown in the Trigger column and on the detail hero's flow chip.                 |
| `task.name`            | Human label. When present, used in place of the raw `task.id` in the Name column and on the detail hero's task chip.      |
| `task.source`          | Event topic / queue name / webhook route. Shown in the Trigger column when there's no `task.schedule`.                    |

### Inherited from the surrounding gen-ai / OTel context

| Attribute                | Used for                                                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `gen_ai.agent.name`      | The "agent" rail on the detail hero and the Agent column in the table. Falls back to `service.name` when absent.                    |
| `service.name`           | Used as the agent-rail label fallback, and as the second term in the derived identity tuple.                                        |
| `gen_ai.conversation.id` | "Origin chat" linkage. When every fire of a task carries the *same* conversation id, the detail hero shows it as the chain's left node and links into `/sessions/$id`. Legacy `ag_ui.thread_id` is read as a fallback via `pickCanonical`. |

### Identity priority (what becomes the row key)

1. **`task.id`** — primary key. One row per stable id.
2. **Root span operation name** — for fires emitted by cloud-native runtimes that don't stamp `task.id` (KEDA, Cloud Scheduler, etc.), the span name typically encodes the trigger source (e.g. `process queueitem`). agentops uses this as the cloud-semconv fallback identity. *Not a direct read of `cloud.scheduler.job.name` / `messaging.destination.name` / `http.route` today — those are the upstream attrs, but the span name is what reaches `TraceSummary.rootOperation`.*
3. **Derived `(service.name, gen_ai.agent.name, trigger_type)`** — last resort. Lossy: all fires sharing the same service+agent+trigger collapse into one row. Flagged with a `derived` badge so you know the rollup isn't authoritative.

## What the detail hero shows

When you click a row, `/tasks/$key` renders three layers from the same fire data — no extra fetch:

- **Flow chain** — `[origin chat OR trigger] ▶ [task] ▶ [agent]`. The left node is the `gen_ai.conversation.id`-linked session when one exists; otherwise it's the `task.schedule` / `task.source` / kind label.
- **Cadence line** — median inter-fire interval (`every ~10m`), the coefficient-of-variation jitter (`±12%`), last fire age, and error count. Derived from the actual fire timestamps in the window — no need to parse cron expressions.
- **Fire timeline** — one tick per fire colored by status. When cadence looks regular (≥3 fires, derived median), faint dashed verticals project expected next-fire times beyond the last actual fire. Gaps in those marks are the visual cue for "should've fired by now."

## Non-goals

- Storing task definitions locally. Definitions live in the observed app.
- Editing tasks from agentops (pause / cancel / re-run). Read-only.
- Parsing `task.schedule` cron expressions to compute exact expected-fire times. We use empirical median interval instead — works for cron, interval, and event-driven cadences with one path.
- Cross-provider identity normalization beyond the priority order above. Apps that emit `cloud.scheduler.job.name` and apps that emit `task.id` show up as separate rows even if they're conceptually the same job.

See `docs/plans/trace-drawer.md` for the in-flight work that lets clicking a fire open the trace as a drawer instead of a full-page navigation.
