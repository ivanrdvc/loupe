import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT, label, PRESETS, parse, serialize, type TimeRange, windowMs } from './time-range'

describe('parse', () => {
  it('accepts preset numbers from PRESETS', () => {
    for (const p of PRESETS) {
      expect(parse(p)).toBe(p)
      expect(parse(String(p))).toBe(p)
    }
  })

  it('rejects non-preset numbers and falls back', () => {
    expect(parse(5)).toBe(DEFAULT)
    expect(parse(100)).toBe(DEFAULT)
    expect(parse(0)).toBe(DEFAULT)
  })

  it('accepts a custom range object', () => {
    expect(parse({ from: 1000, to: 2000 })).toEqual({ from: 1000, to: 2000 })
  })

  it('rejects custom object with from >= to', () => {
    expect(parse({ from: 2000, to: 1000 })).toBe(DEFAULT)
    expect(parse({ from: 1000, to: 1000 })).toBe(DEFAULT)
  })

  it('rejects custom object with non-number fields', () => {
    expect(parse({ from: '1000', to: 2000 })).toBe(DEFAULT)
    expect(parse({ from: 1000 })).toBe(DEFAULT)
  })

  it('parses serialized custom string', () => {
    expect(parse('1000-2000')).toEqual({ from: 1000, to: 2000 })
  })

  it('rejects malformed custom string', () => {
    expect(parse('abc-def')).toBe(DEFAULT)
    expect(parse('1000-')).toBe(DEFAULT)
    expect(parse('-2000')).toBe(DEFAULT)
    expect(parse('2000-1000')).toBe(DEFAULT)
  })

  it('parses JSON-string of custom object (TanStack Start GET fallback)', () => {
    expect(parse('{"from":1000,"to":2000}')).toEqual({ from: 1000, to: 2000 })
  })

  it('falls back on undefined / null / empty / garbage', () => {
    expect(parse(undefined)).toBe(DEFAULT)
    expect(parse(null)).toBe(DEFAULT)
    expect(parse('')).toBe(DEFAULT)
    expect(parse({})).toBe(DEFAULT)
    expect(parse([])).toBe(DEFAULT)
  })
})

describe('serialize ↔ parse round-trip', () => {
  it('round-trips presets', () => {
    for (const p of PRESETS) {
      expect(parse(serialize(p))).toBe(p)
    }
  })

  it('round-trips custom ranges', () => {
    const r: TimeRange = { from: 1_700_000_000_000, to: 1_700_100_000_000 }
    expect(parse(serialize(r))).toEqual(r)
  })
})

describe('windowMs', () => {
  const NOW = 1_700_000_000_000
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the custom window unchanged', () => {
    expect(windowMs({ from: 100, to: 200 })).toEqual({ from: 100, to: 200 })
  })

  it('computes a preset window ending at now', () => {
    expect(windowMs(7)).toEqual({ from: NOW - 7 * 86_400_000, to: NOW })
  })

  it('slides as time advances (presets are NOT frozen)', () => {
    const first = windowMs(1)
    vi.setSystemTime(new Date(NOW + 60_000))
    const second = windowMs(1)
    expect(second.to - first.to).toBe(60_000)
    expect(second.from - first.from).toBe(60_000)
  })
})

describe('label', () => {
  it('formats preset days', () => {
    expect(label(1)).toBe('Past 1 day')
    expect(label(7)).toBe('Past 7 days')
  })

  it('formats a single-day custom range as one date', () => {
    const start = new Date(2026, 3, 1, 0, 0, 0).getTime()
    const end = new Date(2026, 3, 1, 23, 59, 59).getTime()
    expect(label({ from: start, to: end })).not.toContain('–')
  })

  it('formats a multi-day custom range with separator', () => {
    const start = new Date(2026, 3, 1).getTime()
    const end = new Date(2026, 4, 1).getTime()
    expect(label({ from: start, to: end })).toContain('–')
  })
})
