import { discoverInventory, type InventoryDiscoveryKind, type InventoryObservation } from '#/lib/telemetry'

export interface DetectionWindow {
  fromUs: number
  toUs: number
}

export interface DetectionSource {
  name: string
  // Observations claim the kind ([] = "none, but mine"); null abstains to the next source.
  discover(kind: InventoryDiscoveryKind, window: DetectionWindow): Promise<InventoryObservation[] | null>
}

const sources: DetectionSource[] = [{ name: 'provider', discover: (kind, w) => discoverInventory(kind, w) }]

export function registerDetectionSource(source: DetectionSource): void {
  sources.unshift(source)
}

export async function discoverFromSources(
  kind: InventoryDiscoveryKind,
  window: DetectionWindow,
): Promise<InventoryObservation[]> {
  for (const source of sources) {
    try {
      const observations = await source.discover(kind, window)
      if (observations != null) return observations
    } catch (e) {
      console.error(`[detection] source ${source.name} failed:`, e)
    }
  }
  return []
}
