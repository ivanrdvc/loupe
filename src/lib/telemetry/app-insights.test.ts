import { afterEach, describe, expect, it, vi } from 'vitest'
import { toolError } from '#/lib/spans/conversation'
import { applyExceptionRows, createAppInsightsProvider, normalizeAiRow } from './app-insights'

// Hand-built to the Azure Monitor row shape (no local Azure to capture from).
const CHAT_ROW = {
  id: 'sp-1',
  operation_Id: 'trace-1',
  operation_ParentId: 'sp-agent',
  name: 'chat gpt-4o-mini',
  timestamp: '2026-01-15T10:00:00.000Z',
  duration: 250,
  success: true,
  cloud_RoleName: 'weather-svc',
  itemType: 'dependency',
  type: 'InProc',
  customDimensions: JSON.stringify({
    'gen_ai.operation.name': 'chat',
    'gen_ai.request.model': 'gpt-4o-mini',
    'gen_ai.provider.name': 'openai',
    'gen_ai.usage.input_tokens': 100,
    'gen_ai.usage.output_tokens': 50,
  }),
}

describe('normalizeAiRow', () => {
  it('maps ISO timestamp + ms duration to start/end, attrs from customDimensions', () => {
    const s = normalizeAiRow(CHAT_ROW, 'trace-1')
    expect(s.id).toBe('sp-1')
    expect(s.traceId).toBe('trace-1')
    expect(s.parentId).toBe('sp-agent')
    expect(s.service).toBe('weather-svc')
    expect(s.kind).toBe('internal')
    expect(s.startMs).toBe(Date.parse('2026-01-15T10:00:00.000Z'))
    expect(s.endMs).toBe(Date.parse('2026-01-15T10:00:00.000Z') + 250)
    expect(s.operation).toBe('chat')
    expect(s.model).toBe('gpt-4o-mini')
    expect(s.inputTokens).toBe(100)
    expect(s.outputTokens).toBe(50)
    expect(s.hasError).toBeUndefined()
  })

  it('treats operation_ParentId == operation_Id as a root (parentId null)', () => {
    const s = normalizeAiRow({ ...CHAT_ROW, operation_ParentId: 'trace-1' }, 'trace-1')
    expect(s.parentId).toBeNull()
  })

  it('reads success:false as an errored span', () => {
    const s = normalizeAiRow({ ...CHAT_ROW, success: false }, 'trace-1')
    expect(s.hasError).toBe(true)
  })

  it('derives kind from itemType/type: request→server, http→client', () => {
    expect(normalizeAiRow({ ...CHAT_ROW, itemType: 'request' }, 'trace-1').kind).toBe('server')
    expect(normalizeAiRow({ ...CHAT_ROW, type: 'HTTP' }, 'trace-1').kind).toBe('client')
  })
})

// AI raised tool: row has success:false, exception detail in the `exceptions`
// table joined by operation_ParentId — must surface via toolError like OO.
describe('execute_tool error surfacing (App Insights)', () => {
  const TOOL_ERROR_ROW = {
    id: 'sp-tool-1',
    operation_Id: 'trace-1',
    operation_ParentId: 'sp-agent',
    name: 'execute_tool crash',
    timestamp: '2026-01-15T10:00:01.000Z',
    duration: 5,
    success: false,
    cloud_RoleName: 'weather-svc',
    itemType: 'dependency',
    type: 'InProc',
    customDimensions: JSON.stringify({
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': 'crash',
      'gen_ai.tool.call.id': 'call_l7LXnc8EEA9zCj1XyVW3L4tk',
    }),
  }

  it('marks an errored execute_tool dependency as a failed tool span', () => {
    const s = normalizeAiRow(TOOL_ERROR_ROW, 'trace-1')
    expect(s.operation).toBe('tool')
    expect(s.toolName).toBe('crash')
    expect(s.toolCallId).toBe('call_l7LXnc8EEA9zCj1XyVW3L4tk')
    expect(s.hasError).toBe(true)
  })

  it('enriches the failed tool span from the exceptions table, surfaced by toolError', () => {
    const s = normalizeAiRow(TOOL_ERROR_ROW, 'trace-1')
    applyExceptionRows(
      [s],
      [
        {
          operation_ParentId: 'sp-tool-1',
          type: 'ToolExecutionException',
          outerMessage: 'Error executing tool crash: intentional MCP tool failure',
          outerMethod: 'invoke',
          details: JSON.stringify([{ rawStack: 'Traceback (most recent call last):\n  ...\n' }]),
        },
      ],
    )
    expect(s.errorType).toBe('ToolExecutionException')
    expect(s.errorMessage).toBe('Error executing tool crash: intentional MCP tool failure')
    expect(s.errorStack).toContain('Traceback')
    expect(toolError(s)).toEqual({
      kind: 'ToolExecutionException',
      message: 'Error executing tool crash: intentional MCP tool failure',
      stack: 'Traceback (most recent call last):\n  ...\n',
    })
  })
})

describe('listTraces pushes filters into the KQL before top', () => {
  const provider = (queries: string[]) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { body?: string }) => {
        queries.push(JSON.parse(String(init?.body)).query)
        return { ok: true, json: async () => ({ tables: [{ name: 'PrimaryResult', columns: [], rows: [] }] }) }
      }),
    )
    return createAppInsightsProvider({ appId: 'app', apiKey: 'k' })
  }
  afterEach(() => vi.unstubAllGlobals())

  it('triggerTypes → | where root_trigger_type in before | top', async () => {
    const queries: string[] = []
    await provider(queries).listTraces?.({ triggerTypes: ['scheduled', 'event', 'webhook'], limit: 500 })
    const q = queries.find((s) => s.includes('root_trigger_type in (')) ?? ''
    expect(q).not.toBe('')
    expect(q.indexOf('root_trigger_type in (')).toBeLessThan(q.indexOf('| top'))
  })

  it('serviceName → | where cloud_RoleName before summarize', async () => {
    const queries: string[] = []
    await provider(queries).listTraces?.({ serviceName: 'svc-x', limit: 50 })
    const q = queries.find((s) => s.includes('cloud_RoleName == "svc-x"')) ?? ''
    expect(q).not.toBe('')
    expect(q.indexOf('cloud_RoleName == "svc-x"')).toBeLessThan(q.indexOf('summarize'))
  })
})
