import { describe, expect, it } from 'vitest'
import { classifySpan } from './classify-span'

describe('classifySpan — cost fallback', () => {
  it('uses producer-supplied cost when present (OpenObserve path)', () => {
    const c = classifySpan('chat gpt-5.2', {
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': 'gpt-5.2',
      'gen_ai.usage.input_tokens': 169,
      'gen_ai.usage.output_tokens': 15,
      llm_usage_cost_total: 0.999, // sentinel — fallback must not overwrite
    })
    expect(c.costUsd).toBe(0.999)
  })

  it('derives cost from model + tokens when no cost attribute exists (App Insights path)', () => {
    const c = classifySpan('chat gpt-5.2', {
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': 'gpt-5.2',
      'gen_ai.provider.name': 'openai',
      'gen_ai.usage.input_tokens': 169,
      'gen_ai.usage.output_tokens': 15,
    })
    // gpt-5.2 → $1.75/M input + $14/M output, same as OO emits.
    expect(c.costUsd).toBeCloseTo(0.00050575, 8)
  })

  it('leaves costUsd unset when neither cost attr nor enough data to derive', () => {
    const c = classifySpan('chat unknown-llm', {
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': 'totally-fake-model',
      'gen_ai.usage.input_tokens': 100,
      'gen_ai.usage.output_tokens': 10,
    })
    expect(c.costUsd).toBeUndefined()
  })

  it('leaves costUsd unset for non-chat spans (no model/tokens)', () => {
    const c = classifySpan('execute_tool fetch_user', {
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': 'fetch_user',
    })
    expect(c.costUsd).toBeUndefined()
  })
})

describe('classifySpan — operation classification', () => {
  it('honors openinference.span.kind over span-name inference', () => {
    const c = classifySpan('some_custom_op', { 'openinference.span.kind': 'LLM' })
    expect(c.operation).toBe('chat')
  })

  it('honors openinference.span.kind=AGENT and TOOL', () => {
    expect(classifySpan('x', { 'openinference.span.kind': 'AGENT' }).operation).toBe('invoke_agent')
    expect(classifySpan('x', { 'openinference.span.kind': 'TOOL' }).operation).toBe('tool')
  })

  it('falls through to gen_ai.operation.name when no openinference kind is set', () => {
    const c = classifySpan('whatever', { 'gen_ai.operation.name': 'chat' })
    expect(c.operation).toBe('chat')
  })
})
