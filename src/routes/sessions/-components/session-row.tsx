import { formatAgo, formatCost, formatTokens, metricTone, truncateId } from '#/lib/format'
import type { SessionSummary } from '#/lib/telemetry'

interface SessionRowProps {
  session: SessionSummary
  onOpenSession: () => void
}

export function SessionRow({ session: s, onOpenSession }: SessionRowProps) {
  const label = `Open session ${s.sessionId}`
  const sessionTitle = s.title?.trim()
  const firstInput = s.firstInput?.trim()
  const user = userParts(s)
  const idLabel = truncateId(s.sessionId)
  const hasError = !!s.hasError

  return (
    <tr
      className="cursor-pointer border-b border-zinc-200 transition-colors last:border-b-0 hover:bg-zinc-100/70 focus-visible:bg-zinc-100/70 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-500 dark:border-zinc-800 dark:hover:bg-zinc-800/50 dark:focus-visible:bg-zinc-800/50"
      tabIndex={0}
      title={label}
      onClick={() => onOpenSession()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenSession()
        }
      }}
    >
      <td className="px-3 py-3 align-middle text-sm tabular-nums text-zinc-500 dark:text-zinc-400 lg:pl-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-1.5 shrink-0 rounded-full ${hasError ? 'bg-rose-500' : 'bg-emerald-500/70 dark:bg-emerald-400/70'}`}
            title={hasError ? 'Error' : 'OK'}
          />
          <time
            dateTime={new Date(s.lastSeenMs).toISOString()}
            title={new Date(s.lastSeenMs).toLocaleString()}
            className="whitespace-nowrap"
          >
            {formatAgo(s.lastSeenMs)}
          </time>
        </div>
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="flex min-w-0 items-center gap-x-1.5 text-sm">
          {sessionTitle ? (
            <>
              <span className="min-w-0 flex-1 truncate font-medium text-zinc-950 dark:text-white" title={sessionTitle}>
                {sessionTitle}
              </span>
              <span className="shrink-0 font-mono text-xs text-zinc-500 dark:text-zinc-400">{idLabel}</span>
            </>
          ) : (
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-700 dark:text-zinc-300">
              {idLabel}
            </span>
          )}
          {s.source === 'agent-instance' && (
            <span
              title="Derived from agent-instance hex in span names (no session.id attribute)"
              className="shrink-0 rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300"
            >
              heuristic
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-3 align-middle">
        {firstInput ? (
          <span className="block truncate text-sm text-zinc-700 dark:text-zinc-300" title={firstInput}>
            {firstInput}
          </span>
        ) : (
          <span className="text-sm text-zinc-400 dark:text-zinc-600">—</span>
        )}
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="flex min-w-0 items-center gap-x-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate text-zinc-950 dark:text-white">{user.primary}</span>
          {user.secondary ? (
            <span className="max-w-[min(12rem,40vw)] shrink-0 truncate text-xs text-zinc-500 dark:text-zinc-400">
              {user.secondary}
            </span>
          ) : null}
        </div>
      </td>
      <td
        className={`px-3 py-3 text-right align-middle text-sm font-medium tabular-nums ${metricTone('tokens', s.totalTokens)}`}
      >
        {formatTokens(s.totalTokens)}
      </td>
      <td
        className={`px-3 py-3 text-right align-middle text-sm font-medium tabular-nums ${metricTone('cost', s.totalCostUsd)}`}
      >
        {formatCost(s.totalCostUsd ?? 0)}
      </td>
      <td className="px-3 py-3 text-right align-middle text-sm tabular-nums text-zinc-500 dark:text-zinc-400 lg:pr-4">
        {s.traceCount}
      </td>
    </tr>
  )
}

function userParts(s: SessionSummary): { primary: string; secondary?: string } {
  if (s.userName) return { primary: s.userName, secondary: s.userId ?? s.host }
  if (s.userId) return { primary: s.userId, secondary: s.host }
  if (s.host) return { primary: s.host }
  return { primary: '—' }
}
