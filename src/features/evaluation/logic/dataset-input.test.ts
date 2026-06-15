import { describe, expect, it } from 'vitest'
import { datasetInputFromSnapshot } from './dataset-input'

describe('datasetInputFromSnapshot', () => {
  it('returns empty input for snapshots without llmInput', () => {
    expect(datasetInputFromSnapshot({ toolName: 'search', toolResult: '{"ok":true}' })).toBe('')
  })

  it('drops the system turn and collapses a lone user turn to a string', () => {
    expect(
      datasetInputFromSnapshot({
        llmInput: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Show me all employees' },
        ],
      }),
    ).toBe('Show me all employees')
  })

  it('returns empty input when llmInput holds only a system message (no prompt leak)', () => {
    expect(datasetInputFromSnapshot({ llmInput: [{ role: 'system', content: 'You are a helpful assistant.' }] })).toBe(
      '',
    )
  })

  it('keeps remaining turns as an array once the system turn is dropped', () => {
    expect(
      datasetInputFromSnapshot({
        llmInput: [
          { role: 'system', content: 'sys' },
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'hello' },
        ],
      }),
    ).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
  })
})
