import { describe, expect, it } from 'vitest'
import { bucketSecondsFor, SPARK_BUCKETS, zeroFillBucketed } from './time-series'

const US_PER_SEC = 1_000_000
const SEC_PER_HOUR = 3600

describe('bucketSecondsFor', () => {
  it('floors to 60s for tiny windows so bin() never receives sub-second intervals', () => {
    expect(bucketSecondsFor(0, 1_000_000)).toBe(60)
    expect(bucketSecondsFor(0, 30 * US_PER_SEC)).toBe(60)
  })

  it('divides a 24-hour window into SPARK_BUCKETS slices', () => {
    const expected = Math.floor((SEC_PER_HOUR * 24) / SPARK_BUCKETS)
    expect(bucketSecondsFor(0, 24 * SEC_PER_HOUR * US_PER_SEC)).toBe(expected)
  })

  it('clamps to a 60s minimum even when the window/SPARK_BUCKETS would round to less', () => {
    expect(bucketSecondsFor(0, 10 * 60 * US_PER_SEC)).toBe(60)
  })
})

describe('zeroFillBucketed', () => {
  const fromUs = 0
  const toUs = 24 * SEC_PER_HOUR * US_PER_SEC // 24h
  const bucketSec = bucketSecondsFor(fromUs, toUs)
  const bucketMs = bucketSec * 1000

  it('produces SPARK_BUCKETS slots for a 24h window', () => {
    const out = zeroFillBucketed(
      [],
      fromUs,
      toUs,
      bucketSec,
      () => undefined,
      () => ({ count: 0 }),
    )
    expect(out).toHaveLength(SPARK_BUCKETS)
    expect(out[0].ts).toBe(0)
    expect(out[1].ts - out[0].ts).toBe(bucketMs)
  })

  it('returns [] when the window is empty', () => {
    expect(
      zeroFillBucketed(
        [],
        1000,
        1000,
        60,
        () => undefined,
        () => 0,
      ),
    ).toEqual([])
  })

  it('fills empty slots by calling mapValue({}) — zero-valued row, not a sentinel', () => {
    const out = zeroFillBucketed<{ bucket: number }, { count: number }>(
      [],
      fromUs,
      toUs,
      bucketSec,
      (r) => r.bucket,
      () => ({ count: 0 }),
    )
    expect(out.every((p) => p.value.count === 0)).toBe(true)
  })

  it('matches a row whose timestamp falls inside the slot window (< slot + bucketMs)', () => {
    const rows = [{ bucket: bucketMs - 1, count: 5 }] // just inside slot 0
    const out = zeroFillBucketed(
      rows,
      fromUs,
      toUs,
      bucketSec,
      (r) => r.bucket,
      (r) => ({ count: Number(r.count ?? 0) }),
    )
    expect(out[0].value.count).toBe(5)
    expect(out[1].value.count).toBe(0)
  })

  it('places a row that lands exactly on a slot boundary', () => {
    const rows = [{ bucket: bucketMs, count: 9 }] // exact slot-1 timestamp
    const out = zeroFillBucketed(
      rows,
      fromUs,
      toUs,
      bucketSec,
      (r) => r.bucket,
      (r) => ({ count: Number(r.count ?? 0) }),
    )
    expect(out[0].value.count).toBe(0)
    expect(out[1].value.count).toBe(9)
  })

  it('skips rows whose parseBucket returns undefined', () => {
    const rows = [{ bucket: null, count: 99 } as { bucket: number | null; count: number }]
    const out = zeroFillBucketed(
      rows,
      fromUs,
      toUs,
      bucketSec,
      (r) => (typeof r.bucket === 'number' ? r.bucket : undefined),
      (r) => ({ count: Number(r.count ?? 0) }),
    )
    expect(out.every((p) => p.value.count === 0)).toBe(true)
  })

  it('caps slot count at SPARK_BUCKETS even when the window is large relative to the bucket', () => {
    // 24h window with a 60s bucket would produce 1440 slots without the cap.
    const out = zeroFillBucketed(
      [],
      0,
      24 * SEC_PER_HOUR * US_PER_SEC,
      60,
      () => undefined,
      () => 0,
    )
    expect(out.length).toBeLessThanOrEqual(SPARK_BUCKETS)
  })
})
