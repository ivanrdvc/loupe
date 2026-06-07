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

// Oracle = docs/explanation/02-spec.md, not the implementation.
describe('classifySpan — convention-spec contracts', () => {
  it('accepts graph.node.* as the run-graph identity alias', () => {
    const c = classifySpan('invoke_agent Sub', {
      'graph.node.id': 'n1',
      'graph.node.parent_id': 'n0',
    })
    expect(c.taskId).toBe('n1')
    expect(c.taskParentId).toBe('n0')
  })

  it('reads canonical gen_ai.task.* directly', () => {
    const c = classifySpan('invoke_agent Sub', {
      'gen_ai.task.id': 't1',
      'gen_ai.task.parent.id': 't0',
    })
    expect(c.taskId).toBe('t1')
    expect(c.taskParentId).toBe('t0')
  })

  it('marks a graph.node.parent_id-bearing span as a sub-agent (parent set)', () => {
    const c = classifySpan('invoke_agent Sub', { 'graph.node.parent_id': 'n0' })
    expect(c.taskParentId).toBe('n0')
  })

  it('reads ag_ui.thread_id as an attribute-source session id', () => {
    const c = classifySpan('invoke_agent Bot', { 'ag_ui.thread_id': 'thread-7' })
    expect(c.sessionId).toBe('thread-7')
    expect(c.sessionSource).toBe('attribute')
  })

  it('reads gen_ai.conversation.id as an attribute-source session id', () => {
    const c = classifySpan('chat gpt-4o', { 'gen_ai.conversation.id': 'conv-9' })
    expect(c.sessionId).toBe('conv-9')
    expect(c.sessionSource).toBe('attribute')
  })

  it('reads gen_ai.operation.purpose as the utility purpose', () => {
    const c = classifySpan('chat gpt-4o', {
      'gen_ai.operation.name': 'chat',
      'gen_ai.operation.purpose': 'title_generation',
    })
    expect(c.operationName).toBe('title_generation')
  })
})

describe('classifySpan — tool I/O', () => {
  it('reads canonical gen_ai.tool.call.arguments/result (App Insights / MAF)', () => {
    const c = classifySpan('execute_tool get_weather', {
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.call.arguments': '{"location":"Reykjavik"}',
      'gen_ai.tool.call.result': 'Reykjavik: rainy, 26°C',
    })
    expect(c.inputParams).toBe('{"location":"Reykjavik"}')
    expect(c.toolResult).toBe('Reykjavik: rainy, 26°C')
  })

  it('falls back to the chat-message form (tanstack via OpenObserve llm_input/output)', () => {
    const c = classifySpan('execute_tool get_current_time', {
      'gen_ai.operation.name': 'execute_tool',
      // OO renames gen_ai.input/output.messages -> llm_input/llm_output, flattened to JSON strings
      llm_input: '[{"role":"tool","content":"{\\"timezone\\":\\"UTC\\"}"}]',
      llm_output: '[{"role":"tool","content":"{\\"iso\\":\\"2026-06-06T20:02:26Z\\"}"}]',
    })
    expect(c.inputParams).toBe('{"timezone":"UTC"}')
    expect(c.toolResult).toEqual({ iso: '2026-06-06T20:02:26Z' })
  })

  it('prefers canonical keys over the chat-message fallback when both exist (MAF emits both)', () => {
    const c = classifySpan('execute_tool get_weather', {
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.call.arguments': '{"location":"Reykjavik"}',
      'gen_ai.tool.call.result': 'Reykjavik: rainy, 26°C',
      llm_input: '{"location":"SHOULD_NOT_WIN"}',
      llm_output: 'SHOULD_NOT_WIN',
    })
    expect(c.inputParams).toBe('{"location":"Reykjavik"}')
    expect(c.toolResult).toBe('Reykjavik: rainy, 26°C')
  })
})

describe('classifySpan — streaming: TTFT both forms, usage stays unknown', () => {
  it('reads TTFT from the underscore form (OpenObserve), seconds → ms', () => {
    const c = classifySpan('chat gpt-5-nano', {
      'gen_ai.operation.name': 'chat',
      gen_ai_response_time_to_first_chunk: 0.25,
    })
    expect(c.ttftMs).toBe(250)
  })

  it('reads TTFT from the dotted form (App Insights customDimensions)', () => {
    const c = classifySpan('chat gpt-5-nano', {
      'gen_ai.operation.name': 'chat',
      'gen_ai.response.time_to_first_chunk': 0.25,
    })
    expect(c.ttftMs).toBe(250)
  })

  it('ignores a negative TTFT (no first chunk recorded)', () => {
    const c = classifySpan('chat gpt-5-nano', {
      'gen_ai.operation.name': 'chat',
      'gen_ai.response.time_to_first_chunk': -1,
    })
    expect(c.ttftMs).toBeUndefined()
  })

  it('leaves usage unknown — not 0 — when an interrupted stream omits output tokens', () => {
    const c = classifySpan('chat gpt-5-nano', {
      'gen_ai.operation.name': 'chat',
      'gen_ai.usage.input_tokens': 12,
    })
    expect(c.inputTokens).toBe(12)
    expect(c.outputTokens).toBeUndefined()
  })
})

describe('classifySpan — chat scalar completion', () => {
  it('wraps a scalar completion (llm_output_content) as one assistant message', () => {
    const c = classifySpan('chat gpt-5-nano', {
      'gen_ai.operation.name': 'chat',
      llm_output_content: 'Current time: noon.',
    })
    expect(c.llmOutput).toEqual([{ role: 'assistant', content: 'Current time: noon.' }])
  })

  it('prefers the structured message array over the scalar fallback', () => {
    const c = classifySpan('chat gpt-5-nano', {
      'gen_ai.operation.name': 'chat',
      llm_output: '[{"role":"assistant","content":"structured"}]',
      llm_output_content: 'SHOULD_NOT_WIN',
    })
    expect(c.llmOutput).toEqual([{ role: 'assistant', content: 'structured' }])
  })
})
