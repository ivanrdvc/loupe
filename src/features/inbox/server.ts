import { and, count, desc, eq, isNull, lte, or } from 'drizzle-orm'
import { db } from '#/db'
import { inboxItems } from '#/db/schema'
import type { AlertKind } from '#/lib/alerts/kinds'

export interface InboxRow {
  id: number
  kind: AlertKind
  firedAtMs: number
  summary: string
  traceId: string | null
  dismissedAtMs: number | null
  snoozeUntilMs: number | null
}

const openItems = () =>
  and(isNull(inboxItems.dismissedAt), or(isNull(inboxItems.snoozeUntil), lte(inboxItems.snoozeUntil, new Date())))

export async function listOpenInboxItems(limit = 100): Promise<InboxRow[]> {
  const rows = await db.select().from(inboxItems).where(openItems()).orderBy(desc(inboxItems.firedAt)).limit(limit)
  return rows.map(toInboxRow)
}

export async function countOpenInboxItems(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(inboxItems).where(openItems())
  return row?.value ?? 0
}

export async function dismissInboxItem(id: number): Promise<void> {
  await db.update(inboxItems).set({ dismissedAt: new Date() }).where(eq(inboxItems.id, id))
}

export async function dismissAllOpenInboxItems(): Promise<void> {
  await db.update(inboxItems).set({ dismissedAt: new Date() }).where(openItems())
}

export async function snoozeInboxItem(id: number, until: Date): Promise<void> {
  await db.update(inboxItems).set({ snoozeUntil: until }).where(eq(inboxItems.id, id))
}

function toInboxRow(row: typeof inboxItems.$inferSelect): InboxRow {
  return {
    id: row.id,
    kind: row.kind,
    firedAtMs: row.firedAt.getTime(),
    summary: row.summary,
    traceId: row.traceId,
    dismissedAtMs: row.dismissedAt?.getTime() ?? null,
    snoozeUntilMs: row.snoozeUntil?.getTime() ?? null,
  }
}
