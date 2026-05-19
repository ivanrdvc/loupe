import { describe, expect, it } from 'vitest'
import { classifyTraceCategory } from './trace-category'

describe('classifyTraceCategory', () => {
  it('returns sub-agent when a root execute_tool span sits over invoke_agent children', () => {
    const cat = classifyTraceCategory({
      hasSessionAttribute: false,
      hasRootExecuteTool: true,
      invokeAgentCount: 2,
      chatCount: 3,
    })
    expect(cat).toBe('sub-agent')
  })

  it('returns scheduled / webhook from triggerType', () => {
    const base = { hasSessionAttribute: false, hasRootExecuteTool: false, invokeAgentCount: 0, chatCount: 0 }
    expect(classifyTraceCategory({ ...base, triggerType: 'scheduled' })).toBe('scheduled')
    expect(classifyTraceCategory({ ...base, triggerType: 'webhook' })).toBe('webhook')
  })

  it('returns background for user triggers running in the background', () => {
    const cat = classifyTraceCategory({
      hasSessionAttribute: false,
      hasRootExecuteTool: false,
      invokeAgentCount: 0,
      chatCount: 1,
      triggerType: 'user',
      execution: 'background',
    })
    expect(cat).toBe('background')
  })

  it('foreground user triggers fall through (do not return background)', () => {
    const cat = classifyTraceCategory({
      hasSessionAttribute: true,
      hasRootExecuteTool: false,
      invokeAgentCount: 1,
      chatCount: 1,
      triggerType: 'user',
      execution: 'foreground',
    })
    expect(cat).toBe('chat')
  })

  it('returns chat when a session attribute is present', () => {
    const cat = classifyTraceCategory({
      hasSessionAttribute: true,
      hasRootExecuteTool: false,
      invokeAgentCount: 1,
      chatCount: 2,
    })
    expect(cat).toBe('chat')
  })

  it('returns utility when llmPurpose is set with no session', () => {
    const cat = classifyTraceCategory({
      hasSessionAttribute: false,
      hasRootExecuteTool: false,
      invokeAgentCount: 0,
      chatCount: 1,
      llmPurpose: 'title_generation',
    })
    expect(cat).toBe('utility')
  })

  it('llmPurpose wins over a bare session attribute (title-gen inside a session)', () => {
    const cat = classifyTraceCategory({
      hasSessionAttribute: true,
      hasRootExecuteTool: false,
      invokeAgentCount: 0,
      chatCount: 1,
      llmPurpose: 'title_generation',
    })
    expect(cat).toBe('utility')
  })

  it('returns utility when chats exist but no agents and no session', () => {
    const cat = classifyTraceCategory({
      hasSessionAttribute: false,
      hasRootExecuteTool: false,
      invokeAgentCount: 0,
      chatCount: 1,
    })
    expect(cat).toBe('utility')
  })

  it('returns orphan when nothing classifies it', () => {
    const cat = classifyTraceCategory({
      hasSessionAttribute: false,
      hasRootExecuteTool: false,
      invokeAgentCount: 0,
      chatCount: 0,
    })
    expect(cat).toBe('orphan')
  })

  it('sub-agent classification wins over triggerType (e.g. scheduled sub-agent)', () => {
    const cat = classifyTraceCategory({
      hasSessionAttribute: false,
      hasRootExecuteTool: true,
      invokeAgentCount: 1,
      chatCount: 1,
      triggerType: 'scheduled',
    })
    expect(cat).toBe('sub-agent')
  })
})
