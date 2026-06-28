import { readFileSync } from 'node:fs'
import { skillsCatalog } from './skills'

// The observed project describes its agents here; inlined into the prompt each
// turn, read fresh so edits apply without a restart. Absent/empty → null.
const PROFILE_PATH = process.env.AGENT_PROFILE_PATH ?? 'agent-profile.md'

function projectProfile(): string | null {
  try {
    // Strip HTML-comment editor guidance so an unfilled template counts as empty.
    const text = readFileSync(PROFILE_PATH, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
    return text.trim() || null
  } catch {
    return null
  }
}

export interface PageContext {
  pathname: string
  origin?: string
  traceId?: string
  sessionId?: string
}

/** A session/trace the user pointed the agent at via an @-mention in the composer. */
export interface MentionRef {
  kind: 'session' | 'trace'
  id: string
  label?: string
}

/** A mention with its run summary eagerly resolved server-side (null if gone). */
export interface ResolvedMention extends MentionRef {
  summary: unknown
}

export const BASE = `You are the loupe agent, embedded in loupe — a dashboard for observing AI agent telemetry (traces, sessions, spans, tools, evals). You help users understand what their agents are doing.

Describe the observed run in the third person (the agent did X), not as the reader's own actions. If it failed, open with the failure and its likely cause. Match length to substance — a clean run is a sentence, a real failure a short paragraph — then stop; don't tack on an offer to dig further. Use your tools before answering; never invent metrics or errors, and if a tool returns nothing, say so.

Tools return a concise headline by default; pass detail:true only when a follow-up needs slowest spans, the step path, tokens, or cost. The "link" field is a ready-to-use markdown link — emit it as-is to point the reader at raw messages and tool I/O. To highlight one specific failing step, append &span=<id> to that link's URL (the id is on each error and tool step). "This trace/session/page" means what the user is currently viewing (below). You cannot create datasets or trigger evals yet; say it's coming soon if asked.`

export function requestInstructions(ctx: PageContext, mentions?: ResolvedMention[]): string {
  const here = ctx.traceId
    ? `The user is viewing trace ${ctx.traceId}.`
    : ctx.sessionId
      ? `The user is viewing session ${ctx.sessionId}.`
      : `The user is on the ${ctx.pathname} page.`
  const referenced = mentions?.length
    ? `\n\nThe user @-mentioned these specific runs — they are the subject of the question. Their summaries are below; ground your answer in them and call get_tool_result/get_logs only to dig deeper.${mentions
        .map(
          (m) =>
            `\n\n${m.kind} ${m.id}${m.label ? ` ("${m.label}")` : ''}:\n${m.summary ? JSON.stringify(m.summary) : '(not found)'}`,
        )
        .join('')}`
    : ''
  const profile = projectProfile()
  const profileBlock = profile
    ? `\n\nProject profile — what the observed agents do, the tools they use, and known quirks. Ground project-specific answers in this:\n${profile}`
    : ''
  return `${BASE}${profileBlock}${skillsCatalog()}\n\nCurrent context: ${here}${referenced}`
}
