import { readFileSync } from 'node:fs'

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

// A fork (or user) describes the agent being observed in this file; we inline it
// so answers are grounded in the actual project, not generic telemetry-speak.
// Read fresh each turn so edits apply without a restart; absent file → no section.
const PROFILE_PATH = process.env.AGENT_PROFILE_PATH ?? 'agent-profile.md'

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

const BASE = `You are the loupe agent, embedded in loupe — a dashboard for observing AI agent telemetry (traces, sessions, spans, tools, evals). You help users understand what their agents are doing.

Match length to substance — a trivial run is one sentence, a real failure a short paragraph. Lead with the answer in plain prose; don't pad with bulleted metric lists or fixed sections. When something failed, give the likely cause from the error. Use your tools before answering; never invent metrics or errors, and if a tool returns nothing, say so.

Tools return compact summaries, not raw prompts or tool I/O — for those, surface the get_trace/get_session "link" field as a markdown link to ORIGIN + link (e.g. [open trace](ORIGIN?trace=ID)). When you point at one specific step that has an id (an error or tool step), append &span=<id> so the link highlights it in place (e.g. [jump to the failing call](ORIGIN?trace=ID&span=SPAN_ID)). "This trace/session/page" means what the user is currently viewing (below). You cannot create datasets or trigger evals yet; say it's coming soon if asked.`

export function systemPrompt(ctx: PageContext, mentions?: ResolvedMention[]): string {
  const here = ctx.traceId
    ? `The user is viewing trace ${ctx.traceId}.`
    : ctx.sessionId
      ? `The user is viewing session ${ctx.sessionId}.`
      : `The user is on the ${ctx.pathname} page.`
  const profile = projectProfile()
  const referenced = mentions?.length
    ? `\n\nThe user @-mentioned these specific runs — they are the subject of the question. Their summaries are below; ground your answer in them and call get_tool_result/get_logs only to dig deeper.${mentions
        .map(
          (m) =>
            `\n\n${m.kind} ${m.id}${m.label ? ` ("${m.label}")` : ''}:\n${m.summary ? JSON.stringify(m.summary) : '(not found)'}`,
        )
        .join('')}`
    : ''
  return `${BASE}${profile ? `\n\n## Observed project\n${profile}` : ''}\n\nCurrent context: ${here}${ctx.origin ? `\nORIGIN: ${ctx.origin}` : ''}${referenced}`
}
