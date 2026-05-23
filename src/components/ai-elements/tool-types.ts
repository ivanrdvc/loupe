// Minimal local type shape used by the ported ai-elements Tool component.
// NOT a faithful copy of Vercel AI SDK's `ToolUIPart` / `DynamicToolUIPart`:
// we drop `toolCallId`, drop the full state-discriminated union, and don't
// narrow `input` / `output` / `errorText` by state — the ported `tool.tsx`
// only needs these five fields, and inlining a partial type is enough to
// avoid taking `ai` (~340 transitive pkgs) as a runtime dep.

export type ToolPartState =
  | 'approval-requested'
  | 'approval-responded'
  | 'input-streaming'
  | 'input-available'
  | 'output-available'
  | 'output-denied'
  | 'output-error'

export type ToolPartShape = {
  type: `tool-${string}`
  state: ToolPartState
  input?: unknown
  output?: unknown
  errorText?: string
}

export type DynamicToolPartShape = {
  type: 'dynamic-tool'
  state: ToolPartState
  input?: unknown
  output?: unknown
  errorText?: string
}
