import { createServerFn } from '@tanstack/react-start'
import type { JsonValue } from '#/lib/json'
import type { Operation, TruncatableField } from '#/lib/spans'

// Forks register sources via registerEnrichmentSource() at boot; upstream
// ships an empty registry and the UI shows a static placeholder.
// First non-null wins, registration order.

export interface EnrichSpanRequest {
  spanId: string
  traceId: string
  sessionId?: string
  operation: Operation
  field: TruncatableField
}

export interface EnrichmentSource {
  name: string
  resolve(req: EnrichSpanRequest): Promise<JsonValue | string | null>
}

const sources: EnrichmentSource[] = []

export function registerEnrichmentSource(source: EnrichmentSource): void {
  sources.push(source)
}

export const resolveTruncatedAttr = createServerFn({ method: 'POST' })
  .inputValidator((req: EnrichSpanRequest) => req)
  .handler(async ({ data }): Promise<JsonValue | string | null> => {
    for (const source of sources) {
      try {
        const result = await source.resolve(data)
        if (result != null) return result
      } catch (e) {
        console.error(`[enrich-span] source ${source.name} failed:`, e)
      }
    }
    return null
  })
