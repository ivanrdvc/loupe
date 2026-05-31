import type { EvalScope, ScoreDataType } from './evaluation'

// Starter judges shown in the "Start from template" picker on /evals. To add one,
// append an entry here — that's the whole extension point.
export type JudgeTemplate = {
  key: string
  label: string
  description: string
  scope: EvalScope
  dataType: ScoreDataType
  judgePrompt: string
}

export const JUDGE_TEMPLATES: JudgeTemplate[] = [
  {
    key: 'correctness',
    label: 'Correctness',
    description: "Is the agent's final answer correct for the user's request?",
    scope: 'trace',
    dataType: 'boolean',
    judgePrompt:
      "You are grading an AI agent's final answer to a user. Given the conversation and any expected answer, decide whether the answer is correct and fully addresses the request. Respond 1 if correct, 0 if incorrect or incomplete.",
  },
  {
    key: 'tool_selection',
    label: 'Tool selection',
    description: 'Did the agent pick the right tool and arguments at this step?',
    scope: 'span',
    dataType: 'boolean',
    judgePrompt:
      "You are evaluating an AI agent's tool use at one step. Given the context and the tool call(s) the agent made, decide whether it chose an appropriate tool and arguments for the user's intent. Respond 1 if the choice was appropriate, 0 if it used a wrong/unnecessary tool or missed a needed one.",
  },
]
