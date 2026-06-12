import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import { discoveryCursors, inboxItems, inventory, inventoryVersions } from '#/db/schema'
import type { InventoryDiscoveryKind } from '#/lib/telemetry'
import { discoverFromSources } from './source'

const FIRST_SCAN_MS = 60 * 60 * 1000
const DETECTION_INTERVAL_MS = Number(process.env.DETECTION_INTERVAL_MS) || 60 * 60 * 1000

const running = new Set<InventoryDiscoveryKind>()
const NOOP = { observed: 0, inserted: 0 }

// Read-triggered but gated by the cursor to one scan per interval.
export async function runDetection(kind: InventoryDiscoveryKind): Promise<{ observed: number; inserted: number }> {
  if (running.has(kind)) return NOOP
  const now = Date.now()
  const [cursor] = await db.select().from(discoveryCursors).where(eq(discoveryCursors.kind, kind)).limit(1)
  const lastScannedMs = cursor?.lastScannedAt.getTime()
  if (lastScannedMs != null && now - lastScannedMs < DETECTION_INTERVAL_MS) return NOOP

  const fromMs = lastScannedMs ?? now - FIRST_SCAN_MS
  running.add(kind)
  try {
    const observations = await discoverFromSources(kind, { fromUs: fromMs * 1000, toUs: now * 1000 })
    let inserted = 0

    for (const observation of observations) {
      const [existing] = await db
        .select({
          id: inventory.id,
          lastSeenAt: inventory.lastSeenAt,
          description: inventory.description,
          systemPrompt: inventory.systemPrompt,
          nested: inventory.nested,
        })
        .from(inventory)
        .where(and(eq(inventory.kind, observation.kind), eq(inventory.name, observation.name)))
        .limit(1)

      if (existing) {
        // Newest invocation wins; older ones still backfill a null prompt.
        const isNewer = observation.lastSeenMs >= existing.lastSeenAt.getTime()
        const set: Partial<typeof inventory.$inferInsert> = {}
        if (isNewer) set.lastSeenAt = new Date(observation.lastSeenMs)
        if (observation.description && (isNewer || existing.description == null))
          set.description = observation.description
        if (observation.systemPrompt && (isNewer || existing.systemPrompt == null))
          set.systemPrompt = observation.systemPrompt
        // An agent is a sub-agent once seen invoked as one; never downgrade sub back to main.
        if (observation.nested === true) set.nested = true
        else if (existing.nested == null && observation.nested != null) set.nested = observation.nested
        if (Object.keys(set).length > 0) await db.update(inventory).set(set).where(eq(inventory.id, existing.id))
        if (observation.systemPrompt && observation.systemPrompt !== existing.systemPrompt)
          await recordVersion(existing.id, 'system_prompt', observation.systemPrompt, observation)
        if (observation.description && observation.description !== existing.description)
          await recordVersion(existing.id, 'description', observation.description, observation)
        continue
      }

      const [created] = await db
        .insert(inventory)
        .values({
          kind: observation.kind,
          name: observation.name,
          firstSeenAt: new Date(observation.firstSeenMs),
          firstSeenTraceId: observation.traceId,
          lastSeenAt: new Date(observation.lastSeenMs),
          description: observation.description,
          systemPrompt: observation.systemPrompt,
          nested: observation.nested,
        })
        .returning({ id: inventory.id })
      if (created) {
        if (observation.systemPrompt)
          await recordVersion(created.id, 'system_prompt', observation.systemPrompt, observation)
        if (observation.description)
          await recordVersion(created.id, 'description', observation.description, observation)
      }
      await db
        .insert(inboxItems)
        .values({
          kind,
          firedAt: new Date(observation.firstSeenMs),
          summary: summaryFor(kind, observation.name),
          payloadJson: observation,
          traceId: observation.traceId,
          dedupeKey: `${kind}:${observation.name}`,
        })
        .onConflictDoNothing()
      inserted += 1
    }

    await db
      .insert(discoveryCursors)
      .values({ kind, lastScannedAt: new Date(now) })
      .onConflictDoUpdate({ target: discoveryCursors.kind, set: { lastScannedAt: new Date(now) } })

    return { observed: observations.length, inserted }
  } finally {
    running.delete(kind)
  }
}

async function recordVersion(
  inventoryId: number,
  field: 'system_prompt' | 'description',
  value: string,
  observation: { lastSeenMs: number; traceId?: string },
): Promise<void> {
  await db.insert(inventoryVersions).values({
    inventoryId,
    field,
    value,
    observedAt: new Date(observation.lastSeenMs),
    traceId: observation.traceId,
  })
}

function summaryFor(kind: InventoryDiscoveryKind, name: string): string {
  if (kind === 'new_tool') return `New MCP tool ${name} observed`
  return `New agent ${name} observed`
}
