# TODO — Reconcile OTel GenAI semconv v1.41

Not scheduled — capturing the diff now so it doesn't rot. loupe reads the OTel GenAI
semantic conventions as its wire format, and v1.41 (released 2026-04-28) moved several
span shapes our ingest depends on. This is a "should we, and what breaks" note, **not**
committed work.

## What changed (v1.41, plus the eval event)

- **`invoke_agent` split** into CLIENT (remote) vs INTERNAL (in-process) spans. The client
  group gains `gen_ai.agent.version` and drops `gen_ai.response.{id,model,finish_reasons}`.
- **New `invoke_workflow` operation** — a deterministic multi-agent grouping, distinct from
  an autonomous agent (maps cleanly onto Claude Code's own dynamic-workflow spans).
- **`execute_tool` span naming** now *requires* the tool name (`execute_tool {tool}`).
- **New token buckets**: `gen_ai.usage.reasoning.output_tokens`,
  `gen_ai.usage.cache_read.input_tokens`, `gen_ai.usage.cache_creation.input_tokens`.
- **`gen_ai.evaluation.result` event** (score.value / score.label / explanation, parented to
  the evaluated span) — the standard shape for exactly what loupe's scores/judges already do.

## What it touches

- `src/lib/spans/classify-span.ts` — invoke_agent CLIENT/INTERNAL, the new `invoke_workflow`
  op, the execute_tool naming rule.
- `src/features/inspect/logic/tokens.ts` — fold reasoning + cache-read + cache-creation buckets into the math.
- `docs/explanation/02-spec.md`, `docs/reference/ai-attributes.md` — the curated attr set.
- `src/lib/eval/` — optionally *read* any `gen_ai.evaluation.*` a provider emits, and align our
  own score model's field names to the spec.

## Open questions (decide first)

- **Is it live in our data yet?** v1.41 is still "Development", gated behind
  `OTEL_SEMCONV_STABILITY_OPT_IN`. Do any of our providers/instrumentations emit it today, or is
  this purely forward-prep? Cheap to check the OpenObserve fixtures before writing any code.
- **Back-compat:** keep reading the old `invoke_agent` shape alongside the split, or cut over?
- **eval event:** read-only ingest, or also *emit* `gen_ai.evaluation.result` from our judges?

## Why maybe-not-yet

Nothing emits these unless instrumentation opts in, so this can wait until we see a v1.41 span
in the wild. Writing the diff down now makes the eventual reconcile a lookup, not an excavation.

Source: https://github.com/open-telemetry/semantic-conventions/releases/tag/v1.41.0
