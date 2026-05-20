import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

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
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    uniqueIndex('note_target_unique').on(table.targetKind, table.targetId),
    index('note_updated_idx').on(table.updatedAt),
  ],
)
