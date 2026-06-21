import type { McpLintConfig } from './types'

// Per-rule lint tuning lives in code, not env: a ruleset is a project property,
// reviewed and versioned. Empty in core; a fork disables/reseverities/retunes
// rules here without forking BUILTIN_RULES. Shape: { rules: { <ruleId>: { ... } } }.
export const LINT_CONFIG: McpLintConfig = {}
