import { calcPrice } from '@pydantic/genai-prices'

// Cost computation for chat spans when the telemetry provider didn't
// supply it (App Insights and other generic stores). OpenObserve enriches
// the same way at ingest; we mirror that here at read time.
export function estimateCostUsd(opts: {
  model: string | undefined
  inputTokens: number | undefined
  outputTokens: number | undefined
  cachedInputTokens?: number
  provider?: string
  spanStartMs?: number
}): number | undefined {
  if (!opts.model) return undefined
  if (!opts.inputTokens && !opts.outputTokens) return undefined

  return calcPrice(
    {
      input_tokens: opts.inputTokens,
      output_tokens: opts.outputTokens,
      cache_read_tokens: opts.cachedInputTokens,
    },
    opts.model,
    {
      providerId: opts.provider,
      timestamp: opts.spanStartMs ? new Date(opts.spanStartMs) : undefined,
    },
  )?.total_price
}
