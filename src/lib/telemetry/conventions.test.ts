import { describe, expect, it } from 'vitest'
import { attrKeysFor } from './conventions'

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
})
