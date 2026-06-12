---
title: Accent tones
type: reference
summary: The semantic color system — which accent family means what, and the
  four class-string tiers every colored surface must use. Source of truth is
  `src/lib/tone.ts`.
status: stable
owner: "@ivan"
audience: anyone coloring a UI surface
last-reviewed: 2026-06-12
tags: [ui, design, tailwind, accents]
---

# Accent tones

Every colored surface picks a tone from `src/lib/tone.ts` (`ACCENT`,
`toolTone`) instead of hardcoding Tailwind palette classes. Semantic maps
built on it: `KIND_META` (kind-badge), `metricTone` (format), `SCORE_TONE_*`
(eval), `SPAN_TAGS`/`PURPOSE_CLS` (inspect shared), `SEGMENT_COLORS`
(context bar), JSON syntax colors (code-block), `ROLE_TONE` (detail-panel).

## Families — what each color means

| Family | Meaning |
|--------|---------|
| `violet` | LLM/model identity: model names, chat spans, JSON keys, identifiers, selection accents |
| `emerald` | Agents/sub-agents; strings; pass/success |
| `sky` | Tools, MCP calls, tool_calls finish reason |
| `cyan` | User role, embeddings, webhooks, numbers, parallel markers, sub-agent context segment |
| `pink` | Sub-agent kind badge, message segments, JSON literals |
| `amber` | Warning tier; scheduled/cron kinds; operation purpose badges; blessed/golden |
| `rose` | Critical tier: errors, over-threshold metrics |
| `blue` | Chat kind icon (deliberately off-triad) |
| `teal` | Utility kind icon (deliberately off-triad) |
| `orange` | Event kind |
| `zinc` | Neutral/orphan/unknown |

## Tiers — one formula per usage

| Tier | Formula | Use for |
|------|---------|---------|
| `badge` | `bg-{c}-50 text-{c}-600 dark:bg-{c}-300/10 dark:text-{c}-300` | Tinted pills/chips (kind badges, role chips, purpose labels) |
| `text` | `text-{c}-500 dark:text-{c}-400` | Icons and tag text |
| `ident` | `text-{c}-700 dark:text-{c}-400` | Emphasized identifiers: model/tool/agent names, JSON keys (usually with `font-mono`) |
| `status` | `text-{c}-700 dark:text-{c}-300` | Loud outcome/threshold text: pass counts, error rates, metric escalation |
| `solid` | `bg-{c}-400 dark:bg-{c}-500` | Filled dots, bars, segments |

Rules carried over from the accent scheme:

- Trace/session/span UUIDs are **not** colored.
- Tokens/cost/duration stay neutral unless over `metricTone` thresholds
  ("only when going overboard").
- `indigo` and `fuchsia` are banned.

Deliberate one-off exceptions (not in `tone.ts`): tree selection bar
(`bg-violet-500`), eyebrow model dot, golden-capture highlight ring, dataset
pass border, blessed star.
