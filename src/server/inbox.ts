import { and, count, desc, eq, gt, isNull, lt, lte, or } from 'drizzle-orm'
import { db } from '#/db'
import { inboxItems, inventory } from '#/db/schema'

export interface InboxRow {
  id: number
  kind: string
  firedAtMs: number
  summary: string
  traceId: string | null
  sessionId: string | null
  dismissedAtMs: number | null
  snoozeUntilMs: number | null
}

export interface InventoryRow {
  id: number
  kind: string
  name: string
  namespace: string
  firstSeenAtMs: number
  firstSeenTraceId: string | null
  lastSeenAtMs: number
}

export async function listOpenInboxItems(limit = 100): Promise<InboxRow[]> {
  const now = new Date()
  const rows = await db
    .select()
    .from(inboxItems)
    .where(and(isNull(inboxItems.dismissedAt), or(isNull(inboxItems.snoozeUntil), lte(inboxItems.snoozeUntil, now))))
    .orderBy(desc(inboxItems.firedAt))
    .limit(limit)

  return rows.map(toInboxRow)
}

export async function countOpenInboxItems(): Promise<number> {
  const now = new Date()
  const [row] = await db
    .select({ value: count() })
    .from(inboxItems)
    .where(and(isNull(inboxItems.dismissedAt), or(isNull(inboxItems.snoozeUntil), lte(inboxItems.snoozeUntil, now))))
  return row?.value ?? 0
}

export async function dismissInboxItem(id: number): Promise<void> {
  await db.update(inboxItems).set({ dismissedAt: new Date() }).where(eq(inboxItems.id, id))
}

export async function snoozeInboxItem(id: number, until: Date): Promise<void> {
  await db.update(inboxItems).set({ snoozeUntil: until }).where(eq(inboxItems.id, id))
}

export async function listHomeInventory(
  fromMs: number = Date.now() - 7 * 24 * 60 * 60 * 1000,
  toMs: number = Date.now(),
): Promise<{ newTools: InventoryRow[]; newAgents: InventoryRow[] }> {
  const from = new Date(fromMs)
  const to = new Date(toMs)
  const rows = await db
    .select()
    .from(inventory)
    .where(
      and(
        gt(inventory.firstSeenAt, from),
        lt(inventory.firstSeenAt, to),
        or(eq(inventory.kind, 'mcp_tool'), eq(inventory.kind, 'agent')),
      ),
    )
    .orderBy(desc(inventory.firstSeenAt))
    .limit(20)

  return {
    newTools: rows.filter((row) => row.kind === 'mcp_tool').map(toInventoryRow),
    newAgents: rows.filter((row) => row.kind === 'agent').map(toInventoryRow),
  }
}

function toInboxRow(row: typeof inboxItems.$inferSelect): InboxRow {
  return {
    id: row.id,
    kind: row.kind,
    firedAtMs: row.firedAt.getTime(),
    summary: row.summary,
    traceId: row.traceId,
    sessionId: row.sessionId,
    dismissedAtMs: row.dismissedAt?.getTime() ?? null,
    snoozeUntilMs: row.snoozeUntil?.getTime() ?? null,
  }
}

function toInventoryRow(row: typeof inventory.$inferSelect): InventoryRow {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    namespace: row.namespace,
    firstSeenAtMs: row.firstSeenAt.getTime(),
    firstSeenTraceId: row.firstSeenTraceId,
    lastSeenAtMs: row.lastSeenAt.getTime(),
  }
}
