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
  },
  (table) => [uniqueIndex('inventory_kind_name_namespace_idx').on(table.kind, table.name, table.namespace)],
)

export const alertRules = sqliteTable('alert_rule', {
  id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
  kind: text({ enum: ['new_tool', 'new_agent', 'tool_size_p95', 'tool_error_rate'] }).notNull(),
  configJson: text('config_json', { mode: 'json' }).notNull().default(sql`'{}'`),
  enabled: integer({ mode: 'boolean' }).notNull().default(true),
})

export const inboxItems = sqliteTable(
  'inbox_item',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    ruleId: integer('rule_id').references(() => alertRules.id, { onDelete: 'set null' }),
    kind: text({ enum: ['new_tool', 'new_agent', 'tool_size_p95', 'tool_error_rate'] }).notNull(),
    firedAt: integer('fired_at', { mode: 'timestamp_ms' }).notNull(),
    summary: text().notNull(),
    payloadJson: text('payload_json', { mode: 'json' }).notNull().default(sql`'{}'`),
    traceId: text('trace_id'),
    sessionId: text('session_id'),
    dedupeKey: text('dedupe_key').notNull(),
    dismissedAt: integer('dismissed_at', { mode: 'timestamp_ms' }),
    snoozeUntil: integer('snooze_until', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('inbox_item_dedupe_key_idx').on(table.dedupeKey),
    index('inbox_item_open_idx').on(table.dismissedAt, table.snoozeUntil, table.firedAt),
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

export const promptFolders = sqliteTable(
  'prompt_folder',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    parentId: integer('parent_id').references((): AnySQLiteColumn => promptFolders.id, { onDelete: 'cascade' }),
    kind: text({ enum: ['user', 'system'] })
      .notNull()
      .default('user'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('prompt_folder_parent_idx').on(table.parentId)],
)

export const prompts = sqliteTable(
  'prompt',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    folderId: integer('folder_id').references(() => promptFolders.id, { onDelete: 'set null' }),
    name: text().notNull(),
    description: text(),
    runConfigJson: text('run_config_json', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('prompt_folder_idx').on(table.folderId)],
)

export const promptVersions = sqliteTable(
  'prompt_version',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    promptId: integer('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    version: integer().notNull(),
    messagesJson: text('messages_json', { mode: 'json' }).notNull().default(sql`'[]'`),
    modelParamsJson: text('model_params_json', { mode: 'json' }).notNull().default(sql`'{}'`),
    toolsJson: text('tools_json', { mode: 'json' }).notNull().default(sql`'[]'`),
    responseFormatJson: text('response_format_json', { mode: 'json' }).notNull().default(sql`'{"type":"text"}'`),
    author: text().notNull(),
    sourceRef: text('source_ref'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('prompt_version_prompt_version_idx').on(table.promptId, table.version),
    index('prompt_version_prompt_idx').on(table.promptId),
  ],
)

export const promptTags = sqliteTable(
  'prompt_tag',
  {
    id: integer({ mode: 'number' }).primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    color: text().notNull().default('slate'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [uniqueIndex('prompt_tag_name_idx').on(table.name)],
)

export const promptTagLinks = sqliteTable(
  'prompt_tag_link',
  {
    promptId: integer('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => promptTags.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('prompt_tag_link_pk').on(table.promptId, table.tagId),
    index('prompt_tag_link_tag_idx').on(table.tagId),
  ],
)

// A named, versioned collection of examples fired at the user's agent over HTTP.
// See docs/plans/datasets.md. Versioning is auto-per-mutation: every add/edit/delete
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
