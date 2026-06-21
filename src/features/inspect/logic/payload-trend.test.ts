import { describe, expect, it } from 'vitest'
import type { ToolPayloadPoint } from '#/lib/telemetry'
import { classifyPayloadTrend } from './payload-trend'

const pt = (p95Tokens: number, calls = 5): ToolPayloadPoint => ({ ts: 0, p95Tokens, calls })

describe('classifyPayloadTrend', () => {
  it('flags a rising per-call size as growing (list-shaped)', () => {
    const trend = classifyPayloadTrend([pt(200), pt(400), pt(800), pt(1600)])
    expect(trend.direction).toBe('growing')
    expect(trend.ratio).toBeGreaterThan(1.5)
  })

  it('treats a steady size as flat (bounded)', () => {
    expect(classifyPayloadTrend([pt(400), pt(420), pt(390), pt(410)]).direction).toBe('flat')
  })

  it('detects shrinking', () => {
    expect(classifyPayloadTrend([pt(1600), pt(800), pt(400), pt(200)]).direction).toBe('shrinking')
  })

  it('is flat when there is too little data', () => {
    expect(classifyPayloadTrend([pt(0, 0)]).direction).toBe('flat')
    expect(classifyPayloadTrend([pt(900)]).direction).toBe('flat')
  })

  it('ignores empty buckets', () => {
    expect(classifyPayloadTrend([pt(0, 0), pt(200), pt(0, 0), pt(1600)]).direction).toBe('growing')
  })
})
