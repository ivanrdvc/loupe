import { describe, expect, it } from 'vitest'
import { classifySpan, extractAgentName, extractToolName } from './classify-span'

describe('classifySpan — cost fallback', () => {
  it('uses producer-supplied cost when present (OpenObserve path)', () => {
    const c = classifySpan('chat gpt-5.2', {
      'gen_ai.operation.name': 'chat',
      'gen_ai.request.model': 'gpt-5.2',
      'gen_ai.usage.input_tokens': 169,
      'gen_ai.usage.output_tokens': 15,
      'gen_ai.usage.cost_total': 0.999, // sentinel — fallback must not overwrite
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

describe('extractAgentName / extractToolName — span-name parsers', () => {
  // These parsers are the only source of agent/tool identity when a query
  // returns just operation_name (no flattened attributes), as on the Runs and
  // Tools inventory pages. Drift here breaks both providers silently.
  it('extracts agent name from invoke_agent span', () => {
    expect(extractAgentName('invoke_agent Explorer(a9bcdef0)')).toBe('Explorer')
  })

  it('extracts agent name when no id suffix is present', () => {
    expect(extractAgentName('invoke_agent Planner')).toBe('Planner')
  })

  it('returns undefined for non-invoke_agent spans', () => {
    expect(extractAgentName('chat gpt-4o')).toBeUndefined()
    expect(extractAgentName('execute_tool fetch_url')).toBeUndefined()
    expect(extractAgentName('')).toBeUndefined()
  })

  it('extracts tool name from execute_tool span', () => {
    expect(extractToolName('execute_tool fetch_url')).toBe('fetch_url')
  })

  it('stops at first whitespace — tool names cannot contain spaces', () => {
    expect(extractToolName('execute_tool fetch_url extra junk')).toBe('fetch_url')
  })

  it('returns undefined for non-execute_tool spans', () => {
    expect(extractToolName('invoke_agent Explorer')).toBeUndefined()
    expect(extractToolName('chat gpt-4o')).toBeUndefined()
    expect(extractToolName('')).toBeUndefined()
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
