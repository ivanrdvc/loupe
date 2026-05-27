import { describe, expect, it } from 'vitest'
import { parseChangelog } from './-changelog-data'

const SAMPLE = `# Changelog

## [0.2.0](https://github.com/ivanrdvc/loupe/compare/loupe-v0.1.1...loupe-v0.2.0) (2026-05-20)


### Features

* **shadcn:** migrate UI from Catalyst to shadcn ([#13](https://github.com/ivanrdvc/loupe/issues/13)) ([7716c1f](https://github.com/ivanrdvc/loupe/commit/7716c1f9540edae9ce16cb232d04cc7dfa00048d))
* **traces:** traces view + home charts ([#18](https://github.com/ivanrdvc/loupe/issues/18)) ([4a740ba](https://github.com/ivanrdvc/loupe/commit/4a740ba16c18038962e1e7f22ab53477366aff18))


### Bug Fixes

* tighten span filter ([abc1234](https://github.com/ivanrdvc/loupe/commit/abc1234))

## 0.1.0 (2026-05-17)


### Features

* initial release ([4f90c85](https://github.com/ivanrdvc/loupe/commit/4f90c85))
`

describe('parseChangelog', () => {
  it('parses release-please blocks in order', () => {
    const versions = parseChangelog(SAMPLE)
    expect(versions.map((v) => v.version)).toEqual(['0.2.0', '0.1.0'])
  })

  it('captures the full compare url and date', () => {
    const [first] = parseChangelog(SAMPLE)
    expect(first.date).toBe('2026-05-20')
    expect(first.url).toBe('https://github.com/ivanrdvc/loupe/compare/loupe-v0.1.1...loupe-v0.2.0')
  })

  it('handles plain header without compare url', () => {
    const v010 = parseChangelog(SAMPLE).find((v) => v.version === '0.1.0')
    expect(v010?.url).toBeNull()
    expect(v010?.date).toBe('2026-05-17')
  })

  it('keeps section body as raw markdown for downstream rendering', () => {
    const [first] = parseChangelog(SAMPLE)
    expect(first.sections.map((s) => s.title)).toEqual(['Features', 'Bug Fixes'])
    expect(first.sections[0].body).toContain('* **shadcn:**')
    expect(first.sections[1].body).toContain('tighten span filter')
  })

  it('returns empty array for an empty changelog', () => {
    expect(parseChangelog('# Changelog\n')).toEqual([])
  })

  it('skips empty section bodies', () => {
    const raw = `# Changelog

## [0.1.0](https://x) (2026-01-01)

### Features

### Bug Fixes

* something ([abc](https://x))
`
    const [v] = parseChangelog(raw)
    expect(v.sections.map((s) => s.title)).toEqual(['Bug Fixes'])
  })

  it('rejects malformed headers with mismatched brackets', () => {
    const raw = `# Changelog

## [0.1.0(https://x) (2026-01-01)

### Features

* anything
`
    expect(parseChangelog(raw)).toEqual([])
  })

  it('preserves non-bullet prose inside a section (e.g. BREAKING CHANGES paragraphs)', () => {
    const raw = `# Changelog

## [1.0.0](https://x) (2026-06-01)

### BREAKING CHANGES

The session API has changed. See migration notes.

* drop legacy field
`
    const [v] = parseChangelog(raw)
    expect(v.sections[0].body).toContain('migration notes')
    expect(v.sections[0].body).toContain('drop legacy field')
  })
})
