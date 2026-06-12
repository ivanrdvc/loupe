import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { db } from '#/db'
import { inventory, inventoryVersions } from '#/db/schema'
import { runDetection } from '#/features/inventory/detection'
import type { SystemPromptDetail, SystemPromptEntity, SystemPromptVersion } from './types'

function toEntity(row: typeof inventory.$inferSelect): SystemPromptEntity {
  return {
    id: row.id,
    name: row.name,
    systemPrompt: row.systemPrompt,
    description: row.description,
    firstSeenAt: row.firstSeenAt.getTime(),
    lastSeenAt: row.lastSeenAt.getTime(),
  }
}

function toVersion(row: typeof inventoryVersions.$inferSelect): SystemPromptVersion {
  return { id: row.id, value: row.value, observedAt: row.observedAt.getTime(), traceId: row.traceId }
}

export const listSystemPrompts = createServerFn({ method: 'GET' }).handler(async (): Promise<SystemPromptEntity[]> => {
  void Promise.allSettled([runDetection('new_agent')])
  const rows = await db
    .select()
    .from(inventory)
    .where(and(eq(inventory.kind, 'agent'), isNotNull(inventory.systemPrompt)))
    .orderBy(desc(inventory.lastSeenAt))
  return rows.map(toEntity)
})

export const getSystemPrompt = createServerFn({ method: 'GET' })
  .inputValidator((input: { id: number | string }) => ({ id: Number(input.id) }))
  .handler(async ({ data }): Promise<SystemPromptDetail | null> => {
    const [row] = await db.select().from(inventory).where(eq(inventory.id, data.id)).limit(1)
    if (!row) return null
    const versionRows = await db
      .select()
      .from(inventoryVersions)
      .where(and(eq(inventoryVersions.inventoryId, data.id), eq(inventoryVersions.field, 'system_prompt')))
      .orderBy(desc(inventoryVersions.observedAt))
    return { entity: toEntity(row), versions: versionRows.map(toVersion) }
  })
