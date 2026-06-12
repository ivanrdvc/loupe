import { describe, expect, it } from 'vitest'
import { datasetInputFromSnapshot } from './dataset-input'

describe('datasetInputFromSnapshot', () => {
  it('returns empty input for snapshots without llmInput', () => {
    expect(datasetInputFromSnapshot({ toolName: 'search', toolResult: '{"ok":true}' })).toBe('')
  })
})
