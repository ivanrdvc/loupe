/**
 * What the agent request carries: where the user is, and any runs they pointed at.
 * Pure types shared by the composer (client), the route handler, and the prompt/tool
 * assembly (server) — so the client never has to reach into server/ for them.
 */

/**
 * The page the user is on when they invoke the agent — splices into the prompt as
 * "current context" and binds origin onto the links the tools return.
 */
export interface PageContext {
  pathname: string
  origin?: string
  traceId?: string
  sessionId?: string
}

/**
 * A session/trace the user pointed the agent at via an @-mention in the composer.
 */
export interface MentionRef {
  kind: 'session' | 'trace'
  id: string
  label?: string
}

/**
 * A mention with its run summary eagerly resolved server-side (null if gone), so the
 * agent sees the run inline instead of spending a tool call to fetch it.
 */
export interface ResolvedMention extends MentionRef {
  summary: unknown
}
