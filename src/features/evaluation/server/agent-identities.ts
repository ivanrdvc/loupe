import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { agentIdentities } from '#/db/schema'
import type { AgentIdentity, AgentIdentityConfig, UpsertAgentIdentityInput } from '#/features/evaluation/dataset-types'
import { invalidateIdentity } from '#/features/evaluation/server/agent-auth'

function toIdentity(row: typeof agentIdentities.$inferSelect): AgentIdentity {
  return {
    id: String(row.id),
    label: row.label,
    config: (row.configJson as AgentIdentityConfig | null) ?? {},
  }
}

function asConfig(value: unknown): AgentIdentityConfig {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AgentIdentityConfig) : {}
}

export const listAgentIdentities = createServerFn({ method: 'GET' }).handler(async (): Promise<AgentIdentity[]> => {
  const rows = await db.select().from(agentIdentities).orderBy(agentIdentities.label)
  return rows.map(toIdentity)
})

export const upsertAgentIdentity = createServerFn({ method: 'POST' })
  .inputValidator((input: UpsertAgentIdentityInput) => ({
    id: input.id == null ? null : Number(input.id),
    label: String(input.label).trim(),
    config: asConfig(input.config),
  }))
  .handler(async ({ data }): Promise<AgentIdentity> => {
    if (!data.label) throw new Error('Identity label is required')
    const now = new Date()
    if (data.id != null) {
      const [row] = await db
        .update(agentIdentities)
        .set({ label: data.label, configJson: data.config, updatedAt: now })
        .where(eq(agentIdentities.id, data.id))
        .returning()
      if (!row) throw new Error('upsertAgentIdentity: identity not found')
      invalidateIdentity(String(row.id))
      return toIdentity(row)
    }
    const [row] = await db
      .insert(agentIdentities)
      .values({ label: data.label, configJson: data.config, createdAt: now, updatedAt: now })
      .returning()
    if (!row) throw new Error('upsertAgentIdentity: insert failed')
    return toIdentity(row)
  })

export const deleteAgentIdentity = createServerFn({ method: 'POST' })
  .inputValidator((input: { id: string | number }) => ({ id: Number(input.id) }))
  .handler(async ({ data }): Promise<void> => {
    if (!Number.isFinite(data.id)) return
    await db.delete(agentIdentities).where(eq(agentIdentities.id, data.id))
    invalidateIdentity(String(data.id))
  })
