import { describe, expect, it } from 'vitest'
import { matchesLiveFilter, parseLiveFilter, sampleRateOf } from './online-eval-filter'

describe('parseLiveFilter', () => {
  it('treats null/empty/array as match-all (null)', () => {
    expect(parseLiveFilter(null)).toBeNull()
    expect(parseLiveFilter(undefined)).toBeNull()
    expect(parseLiveFilter({})).toBeNull()
    expect(parseLiveFilter([1, 2])).toBeNull()
  })

  it('clamps sampleRate into 0..1', () => {
    expect(parseLiveFilter({ sampleRate: 2 })).toEqual({ sampleRate: 1 })
    expect(parseLiveFilter({ sampleRate: -1 })).toEqual({ sampleRate: 0 })
    expect(parseLiveFilter({ sampleRate: 0.25 })).toEqual({ sampleRate: 0.25 })
  })

  it('keeps trimmed service/agent matchers', () => {
    expect(parseLiveFilter({ serviceName: ' api ', agentName: 'Bot' })).toEqual({
      serviceName: 'api',
      agentName: 'Bot',
    })
  })

  it('drops blank string matchers', () => {
    expect(parseLiveFilter({ serviceName: '   ' })).toBeNull()
  })
})

describe('matchesLiveFilter', () => {
  const trace = { serviceName: 'api', agent: 'Bot' }

  it('matches everything when the filter is null', () => {
    expect(matchesLiveFilter(trace, null)).toBe(true)
  })

  it('matches on exact serviceName / agentName', () => {
    expect(matchesLiveFilter(trace, { serviceName: 'api' })).toBe(true)
    expect(matchesLiveFilter(trace, { serviceName: 'web' })).toBe(false)
    expect(matchesLiveFilter(trace, { agentName: 'Bot' })).toBe(true)
    expect(matchesLiveFilter(trace, { agentName: 'Other' })).toBe(false)
  })

  it('requires every present matcher to pass', () => {
    expect(matchesLiveFilter(trace, { serviceName: 'api', agentName: 'Bot' })).toBe(true)
    expect(matchesLiveFilter(trace, { serviceName: 'api', agentName: 'Other' })).toBe(false)
  })
})

describe('sampleRateOf', () => {
  it('defaults to 1 when unset', () => {
    expect(sampleRateOf(null)).toBe(1)
    expect(sampleRateOf({ serviceName: 'api' })).toBe(1)
  })
  it('returns the configured rate', () => {
    expect(sampleRateOf({ sampleRate: 0.3 })).toBe(0.3)
  })
})
