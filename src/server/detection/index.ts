import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import { discoveryCursors, inboxItems, inventory } from '#/db/schema'
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
        .select({ id: inventory.id })
        .from(inventory)
        .where(
          and(
            eq(inventory.kind, observation.kind),
            eq(inventory.name, observation.name),
            eq(inventory.namespace, observation.namespace),
          ),
        )
        .limit(1)

      if (existing) {
        await db
          .update(inventory)
          .set({ lastSeenAt: new Date(observation.lastSeenMs) })
          .where(eq(inventory.id, existing.id))
        continue
      }

      await db.insert(inventory).values({
        kind: observation.kind,
        name: observation.name,
        namespace: observation.namespace,
        firstSeenAt: new Date(observation.firstSeenMs),
        firstSeenTraceId: observation.traceId,
        lastSeenAt: new Date(observation.lastSeenMs),
      })
      await db
        .insert(inboxItems)
        .values({
          kind,
          firedAt: new Date(observation.firstSeenMs),
          summary: summaryFor(kind, observation.name, observation.namespace),
          payloadJson: observation,
          traceId: observation.traceId,
          dedupeKey: `${kind}:${observation.name}:${observation.namespace}`,
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

function summaryFor(kind: InventoryDiscoveryKind, name: string, namespace: string): string {
  if (kind === 'new_tool') {
    return namespace ? `New MCP tool ${namespace}.${name} observed` : `New MCP tool ${name} observed`
  }
  return `New agent ${name} observed`
}
