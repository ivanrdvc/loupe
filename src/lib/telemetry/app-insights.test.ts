import { describe, expect, it } from 'vitest'
import { normalizeAiRow } from './app-insights'

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
