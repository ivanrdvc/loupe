import { describe, expect, it } from 'vitest'
import { classifyTraceCategory } from './trace-category'

const base = {
  hasInvokeAgent: false,
  hasChat: false,
  hasRootExecuteTool: false,
  hasSessionAttribute: false,
}

describe('classifyTraceCategory', () => {
  it('returns sub-agent when a root execute_tool sits over an invoke_agent', () => {
    expect(classifyTraceCategory({ ...base, hasRootExecuteTool: true, hasInvokeAgent: true, hasChat: true })).toBe(
      'sub-agent',
    )
  })

  it('returns scheduled / webhook from the root trigger', () => {
    expect(classifyTraceCategory({ ...base, rootTriggerType: 'scheduled' })).toBe('scheduled')
    expect(classifyTraceCategory({ ...base, rootTriggerType: 'webhook' })).toBe('webhook')
  })

  it('returns background for user triggers running in the background', () => {
    expect(
      classifyTraceCategory({
        ...base,
        hasChat: true,
        rootTriggerType: 'user',
        rootExecution: 'background',
      }),
    ).toBe('background')
  })

  it('foreground user triggers fall through to structural rules', () => {
    expect(
      classifyTraceCategory({
        ...base,
        hasSessionAttribute: true,
        hasInvokeAgent: true,
        hasChat: true,
        rootTriggerType: 'user',
        rootExecution: 'foreground',
      }),
    ).toBe('chat')
  })

  it('returns chat whenever an invoke_agent span exists', () => {
    expect(classifyTraceCategory({ ...base, hasSessionAttribute: true, hasInvokeAgent: true, hasChat: true })).toBe(
      'chat',
    )
  })

  it('an agent run with a nested utility purpose stays chat (purpose is span-only, not root)', () => {
    expect(
      classifyTraceCategory({
        ...base,
        hasSessionAttribute: true,
        hasInvokeAgent: true,
        hasChat: true,
        // No rootLlmPurpose: the title_generation activity is a child, not the root.
      }),
    ).toBe('chat')
  })

  it('returns utility when the root activity itself is a purpose-tagged LLM call', () => {
    expect(classifyTraceCategory({ ...base, hasChat: true, rootLlmPurpose: 'title_generation' })).toBe('utility')
  })

  it('cross-system: a session attribute with no agent markers falls through to chat', () => {
    expect(classifyTraceCategory({ ...base, hasSessionAttribute: true, hasChat: true })).toBe('chat')
  })

  it('returns utility for bare chat spans with no agent and no session', () => {
    expect(classifyTraceCategory({ ...base, hasChat: true })).toBe('utility')
  })

  it('returns orphan when nothing classifies it', () => {
    expect(classifyTraceCategory({ ...base })).toBe('orphan')
  })

  it('sub-agent wins over a stray trigger type', () => {
    expect(
      classifyTraceCategory({
        ...base,
        hasRootExecuteTool: true,
        hasInvokeAgent: true,
        // rootTriggerType absent — but if a scheduled fire kicked off the sub-agent,
        // 'scheduled' wins via the trigger switch above. Tested separately.
      }),
    ).toBe('sub-agent')
  })

  it('scheduled trigger on a sub-agent shape still reports scheduled (producer intent wins)', () => {
    expect(
      classifyTraceCategory({
        ...base,
        hasRootExecuteTool: true,
        hasInvokeAgent: true,
        rootTriggerType: 'scheduled',
      }),
    ).toBe('scheduled')
  })
})
