import { readFileSync } from 'node:fs'

export interface PageContext {
  pathname: string
  origin?: string
  traceId?: string
  sessionId?: string
}

// A fork (or user) describes the agent being observed in this file; we inline it
// so answers are grounded in the actual project, not generic telemetry-speak.
// Read fresh each turn so edits apply without a restart; absent file → no section.
const PROFILE_PATH = process.env.ASSISTANT_PROFILE_PATH ?? 'assistant-profile.md'

function projectProfile(): string | null {
  try {
    // HTML comments are editor guidance, not for the model — strip them so an
    // unfilled template counts as empty.
    const text = readFileSync(PROFILE_PATH, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    return text.trim() || null
  } catch {
    return null
  }
}

const BASE = `You are the loupe assistant, embedded in loupe — a dashboard for observing AI agent telemetry (traces, sessions, spans, tools, evals). You help the user understand what their agents are doing.

Be concise and concrete. When the user asks about "this trace/session/page", they mean what they are currently looking at (given below). Use your tools before explaining — never invent durations, token counts, or errors. If a tool returns nothing, say so plainly rather than guessing.

Your tools return compact summaries (aggregates + an ordered step path), not raw message or tool I/O. For the actual prompts, completions, and tool payloads, point the user to open the item: when get_trace/get_session returns a "link" field, surface it as a markdown link to ORIGIN + link (e.g. [open trace](ORIGIN?trace=ID)) — it opens the inspector here without leaving the chat. ORIGIN is given below.

You cannot yet create datasets or trigger eval runs; if asked, say it's coming soon.`

export function systemPrompt(ctx: PageContext): string {
  const here = ctx.traceId
    ? `The user is viewing trace ${ctx.traceId}.`
    : ctx.sessionId
      ? `The user is viewing session ${ctx.sessionId}.`
      : `The user is on the ${ctx.pathname} page.`
  const profile = projectProfile()
  return `${BASE}${profile ? `\n\n## Observed project\n${profile}` : ''}\n\nCurrent context: ${here}${ctx.origin ? `\nORIGIN: ${ctx.origin}` : ''}`
}
