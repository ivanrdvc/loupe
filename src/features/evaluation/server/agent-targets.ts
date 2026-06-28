import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { agentTargets } from '#/db/schema'
import type { AgentTarget, AgentTargetConfig, UpsertAgentTargetInput } from '#/features/evaluation/dataset-types'
import { invalidateTarget } from '#/features/evaluation/server/agent-auth'

function toTarget(row: typeof agentTargets.$inferSelect): AgentTarget {
  return {
    id: String(row.id),
    label: row.label,
    endpointUrl: row.endpointUrl,
    config: (row.configJson as AgentTargetConfig | null) ?? {},
  }
}

function asConfig(value: unknown): AgentTargetConfig {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AgentTargetConfig) : {}
}

export const listAgentTargets = createServerFn({ method: 'GET' }).handler(async (): Promise<AgentTarget[]> => {
  const rows = await db.select().from(agentTargets).orderBy(agentTargets.label)
  return rows.map(toTarget)
})

export const upsertAgentTarget = createServerFn({ method: 'POST' })
  .inputValidator((input: UpsertAgentTargetInput) => ({
    id: input.id == null ? null : Number(input.id),
    label: String(input.label).trim(),
    endpointUrl: String(input.endpointUrl).trim(),
    config: asConfig(input.config),
  }))
  .handler(async ({ data }): Promise<AgentTarget> => {
    if (!data.label) throw new Error('Target label is required')
    if (!data.endpointUrl) throw new Error('Target endpoint is required')
    const now = new Date()
    if (data.id != null) {
      const [row] = await db
        .update(agentTargets)
        .set({ label: data.label, endpointUrl: data.endpointUrl, configJson: data.config, updatedAt: now })
        .where(eq(agentTargets.id, data.id))
        .returning()
      if (!row) throw new Error('upsertAgentTarget: target not found')
      invalidateTarget(String(row.id))
      return toTarget(row)
    }
    const [row] = await db
      .insert(agentTargets)
      .values({
        label: data.label,
        endpointUrl: data.endpointUrl,
        configJson: data.config,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    if (!row) throw new Error('upsertAgentTarget: insert failed')
    return toTarget(row)
  })

export const deleteAgentTarget = createServerFn({ method: 'POST' })
  .inputValidator((input: { id: string | number }) => ({ id: Number(input.id) }))
  .handler(async ({ data }): Promise<void> => {
    if (!Number.isFinite(data.id)) return
    await db.delete(agentTargets).where(eq(agentTargets.id, data.id))
    invalidateTarget(String(data.id))
  })
