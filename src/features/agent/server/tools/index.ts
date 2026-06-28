import { createDatasetTool, getDatasetTool, updateDatasetTool } from './datasets'
import { getLogsTool } from './get-logs'
import { getSessionTool } from './get-session'
import { getToolResultTool } from './get-tool-result'
import { getTraceTool } from './get-trace'
import { listRecentSessionsTool, listRecentTracesTool } from './list-recent'
import { listObservedAgentToolsTool } from './observed-tools'

export { resolveMentions } from './shared'

/**
 * The agent's tool set. `origin` is bound per request (agent.ts prepareCall) so the
 * links the tools return come back ready to emit.
 */
export const makeAgentTools = (origin?: string) => ({
  get_trace: getTraceTool(origin),
  get_session: getSessionTool(origin),
  list_recent_traces: listRecentTracesTool(),
  list_recent_sessions: listRecentSessionsTool(),
  get_tool_result: getToolResultTool(),
  get_logs: getLogsTool(),
  list_observed_agent_tools: listObservedAgentToolsTool(),
  get_dataset: getDatasetTool(),
  create_dataset: createDatasetTool(origin),
  update_dataset: updateDatasetTool(origin),
})
