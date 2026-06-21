import { describe, expect, it } from 'vitest'
import type { JsonValue } from '#/lib/json'
import type { McpTool } from '../types'
import { deriveSignals } from './signals'

function tool(name: string, props: Record<string, JsonValue> = {}): McpTool {
  return {
    id: `s:${name}`,
    serverId: 's',
    serverName: 's',
    name,
    inputSchema: { type: 'object', properties: props },
  }
}

describe('deriveSignals', () => {
  it('flags a list tool with no pagination or filter as unbounded', () => {
    expect(deriveSignals(tool('list_employees'))).toContain('unbounded')
  })

  it('marks org-wide scope as bulk and unbounded', () => {
    const s = deriveSignals(tool('get_all_employees'))
    expect(s).toEqual(expect.arrayContaining(['bulk', 'unbounded']))
  })

  it('does not flag a paginated list as unbounded', () => {
    const s = deriveSignals(tool('list_reports', { cursor: { type: 'string' } }))
    expect(s).toContain('paginated')
    expect(s).not.toContain('unbounded')
  })

  it('does not flag a filterable search as unbounded', () => {
    const s = deriveSignals(tool('search_users', { query: { type: 'string' } }))
    expect(s).toContain('filterable')
    expect(s).not.toContain('unbounded')
  })

  it('marks self-scoped tools and never calls them unbounded', () => {
    const s = deriveSignals(tool('get_my_reports'))
    expect(s).toContain('self-scoped')
    expect(s).not.toContain('unbounded')
  })

  it('returns nothing for a plain mutation', () => {
    expect(deriveSignals(tool('create_note', { title: { type: 'string' } }))).toEqual([])
  })

  it('does not flag a singular by-id fetch', () => {
    expect(deriveSignals(tool('get_employee', { id: { type: 'string' } }))).toEqual([])
  })

  it('treats export/browse as list keywords', () => {
    expect(deriveSignals(tool('export_records'))).toContain('unbounded')
    expect(deriveSignals(tool('browse_catalog'))).toContain('unbounded')
  })

  it('lets self-scope suppress unbounded even when bulk also matches', () => {
    const s = deriveSignals(tool('get_my_all_reports'))
    expect(s).toEqual(expect.arrayContaining(['bulk', 'self-scoped']))
    expect(s).not.toContain('unbounded')
  })

  it('unions fork vocab onto the defaults instead of replacing them', () => {
    const t = tool('searchListings', { keywords: { type: 'string' }, limit: { type: 'number' } })
    expect(deriveSignals(t)).not.toContain('filterable')
    const s = deriveSignals(t, { filterParams: ['keywords'] })
    expect(s).toEqual(expect.arrayContaining(['paginated', 'filterable']))
  })
})
