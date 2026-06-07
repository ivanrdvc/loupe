import { sql } from 'drizzle-orm'
import { type AnySQLiteColumn, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const inventory = sqliteTable(
  'inventory',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    kind: text({ enum: ['mcp_tool', 'mcp_server', 'agent', 'model'] }).notNull(),
    name: text().notNull(),
    namespace: text().notNull().default(''),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
    firstSeenTraceId: text('first_seen_trace_id'),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
    owner: text(),
    notes: text(),
    description: text(),
    systemPrompt: text('system_prompt'),
    // Agents: true once seen only as a nested invocation, false once seen top-level.
    nested: integer({ mode: 'boolean' }),
  },
  (table) => [uniqueIndex('inventory_kind_name_namespace_idx').on(table.kind, table.name, table.namespace)],
)

// Append-on-change history of inventory fields (system prompt, description); latest also lives on `inventory`.
export const inventoryVersions = sqliteTable(
  'inventory_version',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    inventoryId: integer('inventory_id')
      .notNull()
      .references(() => inventory.id, { onDelete: 'cascade' }),
    field: text({ enum: ['system_prompt', 'description'] }).notNull(),
    value: text().notNull(),
    observedAt: integer('observed_at', { mode: 'timestamp_ms' }).notNull(),
    traceId: text('trace_id'),
  },
  (table) => [index('inventory_version_entity_idx').on(table.inventoryId, table.field, table.observedAt)],
)

export const inboxItems = sqliteTable(
  'inbox_item',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    kind: text({ enum: ['new_tool', 'new_agent', 'tool_size_p95', 'tool_error_rate'] }).notNull(),
    firedAt: integer('fired_at', { mode: 'timestamp_ms' }).notNull(),
    summary: text().notNull(),
    payloadJson: text('payload_json', { mode: 'json' }).notNull().default(sql`'{}'`),
    traceId: text('trace_id'),
    dedupeKey: text('dedupe_key').notNull(),
    dismissedAt: integer('dismissed_at', { mode: 'timestamp_ms' }),
    snoozeUntil: integer('snooze_until', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('inbox_item_dedupe_key_idx').on(table.dedupeKey),
    // snooze_until omitted: a range predicate, no help to the fired_at ordered seek.
    index('inbox_item_open_idx').on(table.dismissedAt, table.firedAt),
  ],
)

export const discoveryCursors = sqliteTable('discovery_cursor', {
  kind: text({ enum: ['new_tool', 'new_agent'] }).primaryKey(),
  lastScannedAt: integer('last_scanned_at', { mode: 'timestamp_ms' }).notNull(),
})

export const notes = sqliteTable(
  'note',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    targetKind: text('target_kind', { enum: ['session', 'trace', 'span', 'prompt', 'experiment'] }).notNull(),
    targetId: text('target_id').notNull(),
    parentTraceId: text('parent_trace_id'),
    parentSessionId: text('parent_session_id'),
    body: text().notNull(),
    author: text().notNull(),
    status: text({ enum: ['open', 'resolved'] })
      .notNull()
      .default('open'),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('note_target_unique').on(table.targetKind, table.targetId),
    index('note_updated_idx').on(table.updatedAt),
    index('note_status_updated_idx').on(table.status, table.updatedAt),
  ],
)

// A named, versioned collection of examples fired at the user's agent over HTTP.
// See docs/explanation/datasets.md. Versioning is auto-per-mutation: every add/edit/delete
// of an example bumps `dataset.version`; a run pins the version it ran against.

export const datasets = sqliteTable('dataset', {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  description: text(),
  tagsJson: text('tags_json', { mode: 'json' }).notNull().default(sql`'[]'`),
  // per-dataset endpoint override; null = use the global default (env / GLOBAL_DEFAULT_ENDPOINT)
  endpointOverride: text('endpoint_override'),
  // current version — bumped on every example mutation; runs pin the version they ran against
  version: integer().notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const datasetExamples = sqliteTable(
  'dataset_example',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    datasetId: integer('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    // ExampleInput: a single string OR a ChatMessage[] transcript
    inputJson: text('input_json', { mode: 'json' }).notNull().default(sql`'""'`),
    expected: text(),
    metadataJson: text('metadata_json', { mode: 'json' }).notNull().default(sql`'{}'`),
    // backlink to where this example was captured from (capture-from-trace)
    sourceTraceId: text('source_trace_id'),
    sourceSpanId: text('source_span_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('dataset_example_dataset_idx').on(table.datasetId)],
)

export const datasetRuns = sqliteTable(
  'dataset_run',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    datasetId: integer('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    // the dataset version this run was fired against (pinned at run time)
    datasetVersion: integer('dataset_version').notNull(),
    label: text().notNull(),
    // the agent endpoint this run hit (resolved override ?? global default at run time)
    endpointUrl: text('endpoint_url').notNull(),
    status: text({ enum: ['running', 'complete', 'error'] })
      .notNull()
      .default('complete'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('dataset_run_dataset_idx').on(table.datasetId)],
)

export const datasetRunItems = sqliteTable(
  'dataset_run_item',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    runId: integer('run_id')
      .notNull()
      .references(() => datasetRuns.id, { onDelete: 'cascade' }),
    exampleId: integer('example_id')
      .notNull()
      .references(() => datasetExamples.id, { onDelete: 'cascade' }),
    output: text().notNull().default(''),
    // execution status only ('changed' is derived at read time vs the prior run)
    status: text({ enum: ['ok', 'error', 'pending'] })
      .notNull()
      .default('pending'),
    latencyMs: integer('latency_ms').notNull().default(0),
    tokens: integer().notNull().default(0),
    // the id we minted and passed to the agent as conversation_id — the durable linkage
    // key loupe already groups traces on; traceId is resolved best-effort from it
    conversationId: text('conversation_id'),
    traceId: text('trace_id'),
    // ToolCall[] snapshot from traceId's spans, for tool grading. null = not
    // captured (old rows / fetch failed) → judge falls back to the trace.
    toolCallsJson: text('tool_calls_json', { mode: 'json' }),
    errorText: text('error_text'),
    rawJson: text('raw_json'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('dataset_run_item_run_idx').on(table.runId),
    index('dataset_run_item_example_idx').on(table.exampleId),
    uniqueIndex('dataset_run_item_run_example_idx').on(table.runId, table.exampleId),
  ],
)

export const metricRollup = sqliteTable(
  'metric_rollup',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    metric: text().notNull(),
    bucketKey: text('bucket_key').notNull(),
    value: real().notNull(),
    periodStart: integer('period_start', { mode: 'timestamp_ms' }).notNull(),
    periodEnd: integer('period_end', { mode: 'timestamp_ms' }).notNull(),
    computedAt: integer('computed_at', { mode: 'timestamp_ms' }).notNull(),
    sampleRef: text('sample_ref'),
  },
  (table) => [
    index('metric_rollup_metric_period_idx').on(table.metric, table.periodEnd),
    index('metric_rollup_metric_bucket_idx').on(table.metric, table.bucketKey),
  ],
)

// Evaluation — scores, evaluators, experiments (see docs/plans/evaluation.md).
// One primitive (`score`) shared by human / llm / code writers. `eval_definition`
// (the Evaluator) + `eval_run` (the Experiment) drive the offline + online judge.
// Datasets live in their own tables above; a score's dataset link points at the
// run-item whose output was judged (`dataset_run_item`).

// Shared with `score.dataType` / `score_config.dataType` / `eval_definition.dataType`.
const SCORE_DATA_TYPES = ['numeric', 'categorical', 'boolean', 'text'] as const
// `score.targetKind` and `eval_definition.scope` share this vocabulary.
const SCORE_TARGET_KINDS = ['span', 'trace', 'session'] as const

// Dimension registry — keeps a dimension's vocab consistent across human + judge.
export const scoreConfigs = sqliteTable(
  'score_config',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    name: text().notNull(), // 'tool_selection'
    dataType: text('data_type', { enum: SCORE_DATA_TYPES }).notNull(),
    minValue: real('min_value'),
    maxValue: real('max_value'),
    categories: text({ mode: 'json' }), // ['correct','incorrect'] for categorical
    // Polarity is the source of truth for pass/fail — not a hardcoded word list.
    passLabels: text('pass_labels', { mode: 'json' }), // categorical: labels that count as passing
    failLabels: text('fail_labels', { mode: 'json' }), // categorical: labels that count as failing
    direction: text({ enum: ['higher_better', 'lower_better'] })
      .notNull()
      .default('higher_better'), // numeric polarity
    description: text(),
    archived: integer({ mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('score_config_name_idx').on(table.name)],
)

// A first-class managed evaluator (UI: "Evaluator"): owns a judge model, status,
// and version. `mode` is offline (run on demand) or online (score live traffic).
export const evalDefinitions = sqliteTable(
  'eval_definition',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    scope: text({ enum: SCORE_TARGET_KINDS }).notNull().default('trace'), // what one case is
    dataType: text('data_type', { enum: SCORE_DATA_TYPES }).notNull(),
    source: text({ enum: ['llm', 'code'] })
      .notNull()
      .default('llm'),
    judgePrompt: text('judge_prompt'),
    model: text().notNull().default('gpt-4o-mini'), // default judge model; overridable per run
    targetFieldHints: text('target_field_hints', { mode: 'json' }), // which Span fields the judge reads
    mode: text({ enum: ['offline', 'online'] })
      .notNull()
      .default('offline'),
    liveFilter: text('live_filter', { mode: 'json' }), // online: which incoming traces + sample rate
    status: text({ enum: ['active', 'paused'] })
      .notNull()
      .default('active'),
    version: integer().notNull().default(1), // bump on prompt/model change
    baselineRunId: integer('baseline_run_id').references((): AnySQLiteColumn => evalRuns.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('eval_definition_mode_idx').on(table.mode), index('eval_definition_name_idx').on(table.name)],
)

// One offline execution over a fixed target set (UI: "Experiment").
export const evalRuns = sqliteTable(
  'eval_run',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    definitionId: integer('definition_id')
      .notNull()
      .references(() => evalDefinitions.id, { onDelete: 'cascade' }),
    definitionVersion: integer('definition_version').notNull().default(1),
    status: text({ enum: ['pending', 'running', 'done', 'error'] })
      .notNull()
      .default('pending'),
    targetSelector: text('target_selector', { mode: 'json' }), // a datasetId or a saved trace filter
    blessed: integer({ mode: 'boolean' }).notNull().default(false), // pinned as a baseline
    gitSha: text('git_sha'),
    env: text(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
    summary: text({ mode: 'json' }), // pass/fail counts, costUsd, model used
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('eval_run_definition_idx').on(table.definitionId), index('eval_run_status_idx').on(table.status)],
)

// The unified evaluative primitive. Human / llm / code, disambiguated by `source`.
export const scores = sqliteTable(
  'score',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    targetKind: text('target_kind', { enum: SCORE_TARGET_KINDS }).notNull(),
    targetId: text('target_id').notNull(),
    parentTraceId: text('parent_trace_id'), // denormalized for filtering
    parentSessionId: text('parent_session_id'),
    // 'attribute' = a real session attribute, 'trace' = a trace-id fallback. Lets a
    // session-scoped score disclose whether it bound to a genuine session.
    sessionSource: text('session_source', { enum: ['attribute', 'trace'] }),
    responseId: text('response_id'), // gen_ai.response.id — ingest-time link fallback

    name: text().notNull(), // gen_ai.evaluation.name — 'tool_selection', 'correctness'
    dataType: text('data_type', { enum: SCORE_DATA_TYPES }).notNull(),
    value: real(), // numeric / boolean
    label: text(), // categorical: 'correct' / 'incorrect'
    explanation: text(), // reasoning

    source: text({ enum: ['human', 'llm', 'code'] }).notNull(),
    evaluator: text().notNull(), // 'ivan' | 'gpt-4o-judge' | 'assert:latency'
    // Which evaluator version produced this (llm scores only); null for human /
    // ad-hoc / externally-ingested rows. Pinned so a prompt/model bump is auditable.
    evaluatorVersion: integer('evaluator_version'),
    errorType: text('error_type'),

    runId: integer('run_id').references(() => evalRuns.id, { onDelete: 'cascade' }),
    definitionId: integer('definition_id').references(() => evalDefinitions.id, { onDelete: 'set null' }), // online
    datasetRunItemId: integer('dataset_run_item_id').references(() => datasetRunItems.id, { onDelete: 'set null' }),
    metadata: text({ mode: 'json' }), // per-sample raw verdicts/variance, model params, etc.
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  // Human/online scores upsert on (target, name, evaluator); the partial unique
  // index binds only run-less rows (WHERE run_id IS NULL), so run scores stay append-only.
  (table) => [
    uniqueIndex('score_live_unique')
      .on(table.targetKind, table.targetId, table.name, table.evaluator)
      .where(sql`run_id IS NULL`),
    index('score_target_idx').on(table.targetKind, table.targetId),
    index('score_name_created_idx').on(table.name, table.createdAt),
    index('score_parent_trace_idx').on(table.parentTraceId),
    index('score_run_idx').on(table.runId),
    index('score_definition_idx').on(table.definitionId),
  ],
)
