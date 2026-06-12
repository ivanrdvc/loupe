---
title: Glossary
type: reference
summary: One-line definitions for loupe's core nouns — dataset, example,
  run, run item, evaluator, judge, score. The shared vocabulary for the
  eval/datasets domain.
status: stable
owner: "@ivan"
audience: anyone touching evals, datasets, or scoring
last-reviewed: 2026-06-04
tags: [evals, datasets, domain, vocabulary]
---

# Glossary

The eval/datasets nouns, defined once. Types live in
`src/features/evaluation/dataset-types.ts` and `src/lib/eval/`.

| Term | What it is |
| --- | --- |
| **Dataset** | A named, versioned collection of examples — the question set you grade an agent against. Bumps its `version` when examples change. |
| **Example** | One test case in a dataset: an `input` (a single user question or a multi-turn transcript), an optional `expected` answer, and freeform string `metadata`. May be captured from a real trace (`sourceTraceId`). |
| **Input** | The example's prompt — either a plain string or an array of chat messages (`system`/`user`/`assistant`/`tool` turns). |
| **Expected** | The reference answer an example is graded against. Optional; absent means there's nothing to compare to yet. |
| **Run** | One execution of a whole dataset against an agent endpoint, pinned to the dataset `version` at the time. Produces one run item per example and an aggregate `passRate`. |
| **Run item** | The result of a single example within a run: the agent's `output`, a `status` (`ok` / `changed` / `error` / `pending`), latency, token count, the resulting `traceId`, and a `pass` verdict once judged. |
| **Endpoint** | The agent URL a run fires each example at. Falls back per-dataset override → env default → `GLOBAL_DEFAULT_ENDPOINT`. |
| **Evaluator** | A reusable scoring definition (`EvalDefinition`) applied to run outputs — e.g. an LLM-as-judge template. Lives in `src/lib/eval/`. |
| **Judge** | Running an evaluator over a run's items to assign pass/fail and a pass rate. Can run automatically after a run (auto-judge) or on demand. |
| **Score** | A persisted grade attached to a run item or span. Stored in `dev.db`; references telemetry by id (no local mirror). |
