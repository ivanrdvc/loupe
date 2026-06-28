import { afterEach, describe, expect, it, vi } from 'vitest'
import { toolError } from '#/lib/spans/conversation'
import { countTokens } from '#/lib/tokens'
import { fetchTools } from './analytics-app-insights'
import { applyExceptionRows, createAppInsightsProvider, normalizeAiRow } from './app-insights'
import type { AppInsightsProvider } from './types'

// A non-ASCII result (Japanese tokenizes ~1 token/char) has fewer chars but more
// tokens than the long ASCII one — the shape that made the old char-ordered max
// under-report. Pinned: sparse 1621 tok, dense 1980.
const SPARSE_BODY = 'the quick brown fox jumps over the lazy dog '.repeat(180)
const DENSE_BODY = 'エラー: 注文の処理に失敗しました。再試行してください。'.repeat(110)

describe('fetchTools maxTokens is the token-max, not the char-longest body tokenized', () => {
  it('precondition: the shorter-by-chars body tokenizes to more tokens', () => {
    expect(DENSE_BODY.length).toBeLessThan(SPARSE_BODY.length)
    expect(countTokens(DENSE_BODY)).toBeGreaterThan(countTokens(SPARSE_BODY))
  })

  it('tokenizes all candidates and reports the densest, not the longest', async () => {
    const p = {
      name: 'app-insights',
      fingerprint: 'f',
      query: async (q: string) =>
        /partition by name/.test(q)
          ? [DENSE_BODY, SPARSE_BODY].map((body) => ({ name: 'execute_tool echo', body }))
          : [{ name: 'execute_tool echo', calls: 2, calls_with_result: 2, max_chars: SPARSE_BODY.length }],
    } as unknown as AppInsightsProvider
    const [row] = await fetchTools(p)
    expect(row.maxTokens).toBe(countTokens(DENSE_BODY))
    expect(row.maxTokens).not.toBe(countTokens(SPARSE_BODY))
  })

  it('uses a direct candidate query for a single tool', async () => {
    const queries: string[] = []
    const p = {
      name: 'app-insights',
      fingerprint: 'f',
      query: async (q: string) => {
        queries.push(q)
        return /\| project name, body\s*\| project name, body/.test(q)
          ? [DENSE_BODY, SPARSE_BODY].map((body) => ({ name: 'execute_tool echo', body }))
          : [{ name: 'execute_tool echo', calls: 2, calls_with_result: 2, max_chars: SPARSE_BODY.length }]
      },
    } as unknown as AppInsightsProvider

    const [row] = await fetchTools(p, { name: 'echo' })

    expect(row.maxTokens).toBe(countTokens(DENSE_BODY))
    expect(queries.some((q) => /partition by name/.test(q))).toBe(false)
    expect(queries.some((q) => /top 12 by result_len/.test(q))).toBe(false)
  })

  it('marks max as estimated when not every result body was returned', async () => {
    const p = {
      name: 'app-insights',
      fingerprint: 'f',
      query: async (q: string) =>
        /\| project name, body\s*\| project name, body/.test(q)
          ? [{ name: 'execute_tool echo', body: SPARSE_BODY }]
          : [{ name: 'execute_tool echo', calls: 2, calls_with_result: 2, max_chars: SPARSE_BODY.length }],
    } as unknown as AppInsightsProvider

    const [row] = await fetchTools(p, { name: 'echo' })

    expect(row.maxTokensEst).toBe(true)
  })
})

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

  it('agentName → matches the agent-name attribute, not just the span name', async () => {
    const queries: string[] = []
    await provider(queries).listTraces?.({ agentName: 'loupe agent', limit: 50 })
    const q = queries.find((s) => s.includes('agent_display_name ==')) ?? ''
    expect(q).not.toBe('')
  })
})

describe('listTraces names the agent from the gen_ai.agent.name attr, not the model in the span name', () => {
  const provider = (row: Record<string, unknown>) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          tables: [
            {
              name: 'PrimaryResult',
              columns: Object.keys(row).map((name) => ({ name })),
              rows: [Object.values(row)],
            },
          ],
        }),
      })),
    )
    return createAppInsightsProvider({ appId: 'app', apiKey: 'k' })
  }
  afterEach(() => vi.unstubAllGlobals())

  it('prefers the attribute when the span name carries only the model', async () => {
    const traces =
      (await provider({
        operation_Id: 't1',
        agent_name: 'invoke_agent gpt-5-nano',
        agent_display_name: 'loupe agent',
      }).listTraces?.({})) ?? []
    expect(traces[0]?.agent).toBe('loupe agent')
  })

  it('falls back to parsing the span name when no attribute is present', async () => {
    const traces =
      (await provider({ operation_Id: 't2', agent_name: 'invoke_agent Reviewer', agent_display_name: '' }).listTraces?.(
        {},
      )) ?? []
    expect(traces[0]?.agent).toBe('Reviewer')
  })
})
