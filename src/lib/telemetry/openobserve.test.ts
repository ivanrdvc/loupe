import { describe, expect, it } from 'vitest'
import { spanHasError } from '#/features/inspect/logic/predicates'
import { toolError } from '#/lib/spans/conversation'
import raw from './__fixtures__/oo-raw-hits.json'
import { normalizeOpenObserveHit } from './openobserve'

// Real recorded OO hits → Span, pinning the OO-specific extraction seam.
describe('normalizeOpenObserveHit', () => {
  it('maps a chat hit: ns→ms time, client kind, tokens/cost/model/session', () => {
    const s = normalizeOpenObserveHit(raw.chat)
    expect(s.id).toBe('205b45336efe7efc')
    expect(s.traceId).toBe('d180744d35a0660e31f4c207ff52d59d')
    expect(s.parentId).toBe('c6eda740bcf460ad')
    expect(s.service).toBe('Aporia.Cli')
    expect(s.kind).toBe('client')
    expect(s.operation).toBe('chat')
    expect(s.startMs).toBe(1_780_601_600_962)
    expect(s.endMs).toBe(1_780_601_605_941)
    expect(s.model).toBe('claude-haiku-4-5')
    expect(s.tokens).toBe(25253)
    expect(s.inputTokens).toBe(24807)
    expect(s.outputTokens).toBe(446)
    expect(s.costUsd).toBeCloseTo(0.027037, 6)
    expect(s.sessionSource).toBe('attribute')
    expect(s.hasError).toBeUndefined()
    expect(s.rawAttributes).toBe(raw.chat)
  })

  it('maps a tool hit: internal kind, tool name/call-id/params', () => {
    const s = normalizeOpenObserveHit(raw.tool)
    expect(s.operation).toBe('tool')
    expect(s.kind).toBe('internal')
    expect(s.toolName).toBe('FetchFile')
    expect(s.toolCallId).toBe('toolu_011SV3sofYGkx83H6dVocvB3')
    expect(s.inputParams).toContain('Ordering.API')
  })

  it('maps an errored agent hit: ERROR→hasError+type, null parent, agent name/id', () => {
    const s = normalizeOpenObserveHit(raw.agent)
    expect(s.operation).toBe('invoke_agent')
    expect(s.parentId).toBeNull()
    expect(s.agentName).toBe('Reviewer')
    expect(s.agentId).toBe('c2d899bced824ea2b7493064e62864d0')
    expect(s.hasError).toBe(true)
    expect(s.errorType).toBe('System.Threading.Tasks.TaskCanceledException')
  })
})

describe('raised execute_tool span surfaces as an error end-to-end', () => {
  // Real OO `execute_tool crash` hit: type/message/stack live only in the
  // serialized `events` array, with no gen_ai_tool_call_result.
  const stack =
    'Traceback (most recent call last):\n  File "_tools.py", line 734, in invoke\n    raise ToolExecutionException(...)\nagent_framework.exceptions.ToolExecutionException: Error executing tool crash: intentional MCP tool failure\n'
  const crashHit = {
    span_status: 'ERROR',
    status_code: 2,
    status_message: "ToolExecutionException('Error executing tool crash: intentional MCP tool failure')",
    error_type: 'ToolExecutionException',
    span_id: 'f8850ef32fe47108',
    trace_id: '616d95d37db76bb490de6ce82b84d0fd',
    reference_parent_span_id: '4d5826ef78012c37',
    span_kind: 1,
    service_name: 'maf-sandbox',
    operation_name: 'execute_tool crash',
    gen_ai_operation_name: 'execute_tool',
    gen_ai_tool_call_id: 'call_l7LXnc8EEA9zCj1XyVW3L4tk',
    gen_ai_tool_name: 'crash',
    gen_ai_tool_type: 'function',
    start_time: 1_780_836_257_291_874_000,
    end_time: 1_780_836_257_390_126_000,
    events: JSON.stringify([
      {
        name: 'exception',
        _timestamp: 1_780_836_257_387_432_000,
        'exception.type': 'agent_framework.exceptions.ToolExecutionException',
        'exception.message': 'Error executing tool crash: intentional MCP tool failure',
        'exception.stacktrace': stack,
        'exception.escaped': 'False',
      },
    ]),
  }

  it('recovers error type/message/stack from the serialized events array', () => {
    const s = normalizeOpenObserveHit(crashHit)
    expect(s.operation).toBe('tool')
    expect(s.toolName).toBe('crash')
    expect(s.hasError).toBe(true)
    // Short top-level error_type wins over the qualified events type.
    expect(s.errorType).toBe('ToolExecutionException')
    // Message + stack exist ONLY in the events array — recovered by the parser.
    expect(s.errorMessage).toBe('Error executing tool crash: intentional MCP tool failure')
    expect(s.errorStack).toContain('Traceback (most recent call last):')
  })

  it('toolError and spanHasError both report the failure with detail', () => {
    const s = normalizeOpenObserveHit(crashHit)
    expect(spanHasError(s)).toBe(true)
    expect(toolError(s)).toEqual({
      kind: 'ToolExecutionException',
      message: 'Error executing tool crash: intentional MCP tool failure',
      stack,
    })
  })

  it('falls back to status_message when no exception event is present', () => {
    const noEvents: Record<string, unknown> = { ...crashHit }
    delete noEvents.events
    const s = normalizeOpenObserveHit(noEvents)
    expect(s.hasError).toBe(true)
    expect(s.errorMessage).toBe("ToolExecutionException('Error executing tool crash: intentional MCP tool failure')")
  })
})
