import { describe, expect, it } from 'vitest'
import { aiCoalesce, attrKeysFor, ooColumns } from './conventions'

// taskParentId is the sub-agent marker the listSpans queries filter on; its
// alias set must match what classifySpan reads (spec: gen_ai.task.parent.id,
// graph.node.parent_id) or a producer's sub-agents go missing from the Spans tab.
describe('taskParentId alias resolution', () => {
  it('covers both spec aliases in dotted and underscore form', () => {
    expect(attrKeysFor('taskParentId')).toEqual([
      'gen_ai.task.parent.id',
      'gen_ai_task_parent_id',
      'graph.node.parent_id',
      'graph_node_parent_id',
    ])
  })

  it('ooColumns yields the underscore columns, schema-filtered', () => {
    expect(ooColumns('taskParentId')).toEqual(['gen_ai_task_parent_id', 'graph_node_parent_id'])
    expect(ooColumns('taskParentId', { known: new Set(['gen_ai_task_parent_id']) })).toEqual(['gen_ai_task_parent_id'])
    expect(ooColumns('taskParentId', { known: new Set() })).toEqual([])
  })

  it('aiCoalesce checks customDimensions for every form', () => {
    const expr = aiCoalesce('taskParentId')
    expect(expr).toContain('customDimensions["gen_ai.task.parent.id"]')
    expect(expr).toContain('customDimensions["graph.node.parent_id"]')
  })
})
