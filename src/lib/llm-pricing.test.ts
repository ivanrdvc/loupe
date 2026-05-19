import { describe, expect, it } from 'vitest'
import { estimateCostUsd } from './llm-pricing'

describe('estimateCostUsd', () => {
  it('returns undefined when model is missing', () => {
    expect(estimateCostUsd({ model: undefined, inputTokens: 1000, outputTokens: 10 })).toBeUndefined()
  })

  it('returns undefined when tokens are missing', () => {
    expect(estimateCostUsd({ model: 'gpt-5', inputTokens: undefined, outputTokens: undefined })).toBeUndefined()
    expect(estimateCostUsd({ model: 'gpt-5', inputTokens: 0, outputTokens: 0 })).toBeUndefined()
  })

  it('returns undefined for unknown models', () => {
    expect(estimateCostUsd({ model: 'totally-fake-model-xyz', inputTokens: 1000, outputTokens: 10 })).toBeUndefined()
  })

  it('computes cost for gpt-5.2 matching the rates OpenObserve emits', () => {
    // OpenObserve was observed locally to bill $1.75/M input + $14/M output for gpt-5.2.
    // Same upstream price table (LiteLLM/Helicone), so we should land on identical numbers.
    const cost = estimateCostUsd({ model: 'gpt-5.2', inputTokens: 1_000_000, outputTokens: 1_000_000 })
    expect(cost).toBeCloseTo(15.75, 5)
  })

  it('computes per-call cost — 169 in / 15 out gpt-5.2 ≈ $0.00050575 (matches OO sample)', () => {
    const cost = estimateCostUsd({ model: 'gpt-5.2', inputTokens: 169, outputTokens: 15 })
    expect(cost).toBeCloseTo(0.00050575, 8)
  })

  it('discounts cached input tokens for OpenAI models', () => {
    // OpenAI cached input is half-priced. If 1000 of the 1000 input tokens
    // are cache hits, total cost should be lower than the all-fresh case.
    const allFresh = estimateCostUsd({
      model: 'gpt-5.2',
      inputTokens: 1000,
      outputTokens: 0,
      cachedInputTokens: 0,
      provider: 'openai',
    })
    const allCached = estimateCostUsd({
      model: 'gpt-5.2',
      inputTokens: 1000,
      outputTokens: 0,
      cachedInputTokens: 1000,
      provider: 'openai',
    })
    expect(allFresh).toBeGreaterThan(0)
    expect(allCached).toBeGreaterThan(0)
    expect(allCached ?? Infinity).toBeLessThan(allFresh ?? 0)
  })

  it('honors per-model rates (different families => different cost)', () => {
    const expensive = estimateCostUsd({ model: 'gpt-5.2', inputTokens: 1_000_000, outputTokens: 0 })
    const cheap = estimateCostUsd({ model: 'gpt-5-nano', inputTokens: 1_000_000, outputTokens: 0 })
    expect(expensive ?? 0).toBeGreaterThan(cheap ?? Infinity)
  })
})
