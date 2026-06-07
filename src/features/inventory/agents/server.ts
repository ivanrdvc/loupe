import { createServerFn } from '@tanstack/react-start'
import { desc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { inventory } from '#/db/schema'
import { runDetection } from '#/features/inventory/detection'
import { listAgentMetrics } from '#/lib/telemetry'

export interface AgentRow {
  id: number
  name: string
  kind: 'main' | 'sub'
  description: string | null
  systemPrompt: string | null
  calls: number
  errorRate: number
  p50Ms: number
  p95Ms: number
  firstSeenAtMs: number
  firstSeenTraceId: string | null
  lastSeenAtMs: number
}

export const listAgents = createServerFn({ method: 'GET' }).handler(async (): Promise<AgentRow[]> => {
  // Fire-and-forget; cursor-gated to one scan per interval like the home inbox.
  void Promise.allSettled([runDetection('new_agent')])
  const [rows, metrics] = await Promise.all([
    db.select().from(inventory).where(eq(inventory.kind, 'agent')).orderBy(desc(inventory.lastSeenAt)),
    listAgentMetrics().catch(() => []),
  ])
  const byName = new Map(metrics.map((m) => [m.name, m]))
  return rows.map((row) => {
    const m = byName.get(row.name)
    return {
      id: row.id,
      name: row.name,
      kind: row.nested ? 'sub' : 'main',
      description: row.description,
      systemPrompt: row.systemPrompt,
      calls: m?.calls ?? 0,
      errorRate: m?.errorRate ?? 0,
      p50Ms: m?.p50Ms ?? 0,
      p95Ms: m?.p95Ms ?? 0,
      firstSeenAtMs: row.firstSeenAt.getTime(),
      firstSeenTraceId: row.firstSeenTraceId,
      lastSeenAtMs: row.lastSeenAt.getTime(),
    }
  })
})
