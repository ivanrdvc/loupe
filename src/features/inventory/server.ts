import { and, desc, eq, gt, lt, or } from 'drizzle-orm'
import { db } from '#/db'
import { inventory } from '#/db/schema'

export interface InventoryRow {
  id: number
  kind: string
  name: string
  firstSeenAtMs: number
  firstSeenTraceId: string | null
  lastSeenAtMs: number
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

function toInventoryRow(row: typeof inventory.$inferSelect): InventoryRow {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    firstSeenAtMs: row.firstSeenAt.getTime(),
    firstSeenTraceId: row.firstSeenTraceId,
    lastSeenAtMs: row.lastSeenAt.getTime(),
  }
}
