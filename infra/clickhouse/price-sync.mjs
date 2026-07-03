// Populates loupe.model_prices_src (backing the model_prices dictionary) so
// ClickHouse can materialize CostUsd at ingest — mirroring how Langfuse/OpenObserve
// price at write time. @pydantic/genai-prices stays the single source of truth:
// this resolves the per-token price of every (provider, model) actually present in
// otel_traces via calcPrice, then loads the results into CH. Re-run to pick up new
// models or a lib price update. Unknown models (calcPrice → null) are skipped and
// price to 0, same as the read-time path.
import { createClient } from '@clickhouse/client'
import { calcPrice } from '@pydantic/genai-prices'

const client = createClient({
  url: process.env.CLICKHOUSE_URL ?? 'http://localhost:8123',
  database: process.env.CLICKHOUSE_DB ?? 'loupe',
  username: process.env.CLICKHOUSE_USER ?? 'loupe',
  password: process.env.CLICKHOUSE_PASS ?? 'loupe',
})

const M = 1_000_000
const perToken = (usage, model, providerId) => {
  try {
    return calcPrice(usage, model, { providerId: providerId || undefined })?.total_price
  } catch {
    return undefined // e.g. cache_read > input; caller falls back
  }
}

// input_ppt = uncached input rate; cache_read_ppt = cached input rate (all-cached
// probe); output_ppt = output rate. Matches genai-prices' uncached=input-cache split.
function resolvePrices(provider, model) {
  const input = perToken({ input_tokens: M, output_tokens: 0 }, model, provider)
  const output = perToken({ input_tokens: 0, output_tokens: M }, model, provider)
  if (input == null && output == null) return null
  const cachedTotal = perToken({ input_tokens: M, output_tokens: 0, cache_read_tokens: M }, model, provider)
  return {
    input_ppt: (input ?? 0) / M,
    output_ppt: (output ?? 0) / M,
    cache_read_ppt: (cachedTotal ?? input ?? 0) / M,
  }
}

const rows = await client
  .query({
    query: `SELECT Provider AS provider, Model AS model FROM loupe.otel_traces
            WHERE GenAiOperation = 'chat' AND Model != '' GROUP BY Provider, Model`,
    format: 'JSONEachRow',
  })
  .then((rs) => rs.json())

const priced = []
for (const { provider, model } of rows) {
  const p = resolvePrices(provider, model)
  if (p) priced.push({ provider, model, ...p })
}

await client.command({ query: 'TRUNCATE TABLE loupe.model_prices_src' })
if (priced.length) await client.insert({ table: 'loupe.model_prices_src', values: priced, format: 'JSONEachRow' })
await client.command({ query: 'SYSTEM RELOAD DICTIONARY loupe.model_prices' })

console.log(`priced ${priced.length}/${rows.length} models:`)
for (const p of priced)
  console.log(
    `  ${p.provider || '∅'}/${p.model}  in=${p.input_ppt * M} out=${p.output_ppt * M} cache=${p.cache_read_ppt * M} (per 1M)`,
  )
await client.close()
