import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronDown, Info, X } from 'lucide-react'
import { useState } from 'react'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '#/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { useTimeRange } from '#/hooks/use-time-range'
import { formatDuration, formatPercent, formatTokens, tokensFromChars, truncateId } from '#/lib/format'
import type { ToolCallSample, ToolRow } from '#/lib/telemetry'
import { ACCENT, toolTone } from '#/lib/tone'
import { toolDisplayName } from '#/lib/tools'
import { toolDetailQuery, toolPayloadBodyQuery, toolRecentCallsQuery } from './tool-data'

interface Props {
  toolName: string | null
  onClose: () => void
}

export function ToolInspectDrawer({ toolName, onClose }: Props) {
  const open = toolName !== null
  const name = toolName ?? ''
  const tone = toolTone('tool')
  const [range] = useTimeRange()
  const { data: detail, isLoading: detailLoading } = useQuery({
    ...toolDetailQuery(name, range),
    enabled: open,
  })
  const { data: recent, isLoading: recentLoading } = useQuery({
    ...toolRecentCallsQuery(name, range),
    enabled: open,
  })

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 bg-background p-0 text-foreground data-[side=right]:sm:max-w-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <tone.icon className={`size-4 shrink-0 ${tone.text}`} aria-hidden />
            <SheetTitle className={`truncate font-mono text-sm font-medium ${ACCENT.violet.ident}`}>
              {toolDisplayName(name)}
            </SheetTitle>
            <SheetDescription className="sr-only">Tool detail</SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X aria-hidden />
            </Button>
          </SheetClose>
        </header>

        <ScrollArea className="min-h-0 flex-1">
          <StatsGrid detail={detail ?? null} loading={detailLoading} />
          <RecentCallsSection rows={recent ?? []} loading={recentLoading} />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function StatsGrid({ detail, loading }: { detail: ToolRow | null; loading: boolean }) {
  if (loading && !detail) {
    return <div className="px-4 py-6 text-xs text-muted-foreground">Loading…</div>
  }
  if (!detail) {
    return <div className="px-4 py-6 text-xs text-muted-foreground">No calls observed.</div>
  }
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-b px-4 py-4 sm:grid-cols-3">
      <Stat label="Calls" value={detail.calls.toLocaleString('en-US')} hint="Tool invocations in this window." />
      <Stat
        label="Errors"
        hint="Failed invocations. Target: < 1% error rate."
        value={
          <span className="flex items-baseline gap-1.5">
            <span className="tabular-nums">{detail.errors.toLocaleString('en-US')}</span>
            {detail.errors > 0 && (
              <Badge variant="destructive" className="px-1 text-[10px]">
                {formatPercent(detail.errorRate, 1)}
              </Badge>
            )}
          </span>
        }
      />
      <Stat label="p95 latency" hint="95th percentile duration. Target: < 5s." value={formatDuration(detail.p95Ms)} />
      <Stat
        label="p95 result"
        hint="95th percentile result size. Target: < 2k tokens to keep context lean."
        value={<TokensFromChars chars={detail.p95Bytes} />}
      />
      <Stat
        label="max result"
        hint="Largest single result in this window — the worst case that can blow the context budget at scale."
        value={<TokensFromChars chars={detail.maxBytes} />}
      />
      <Stat
        label="total returned"
        hint="Sum of all result bytes — total context this tool burned over the window."
        value={<TokensFromChars chars={detail.totalBytes} />}
      />
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`About ${label}`} className="cursor-help">
                <Info className="size-3" aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        )}
      </span>
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  )
}

export function TokensFromChars({ chars }: { chars: number }) {
  if (!chars) return <span className="text-muted-foreground">—</span>
  const tokens = tokensFromChars(chars)
  return (
    <span title={`${chars.toLocaleString('en-US')} chars · ≈${tokens.toLocaleString('en-US')} tokens`}>
      {formatTokens(tokens)}
      <span className="text-muted-foreground"> tok</span>
    </span>
  )
}

function RecentCallsSection({ rows, loading }: { rows: ToolCallSample[]; loading: boolean }) {
  return (
    <section className="flex min-h-0 flex-col px-4 py-4">
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">Recent calls</h3>
      {loading && rows.length === 0 ? (
        <div className="py-4 text-xs text-muted-foreground">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="py-4 text-xs text-muted-foreground">No recent calls.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Trace</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="text-right tabular-nums">Duration</TableHead>
              <TableHead className="text-right tabular-nums">Size</TableHead>
              <TableHead className="w-12 text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <RecentCallRow key={`${r.traceId}:${r.startedAtMs}`} row={r} />
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}

// Clicking a row with a result lazily fetches its actual payload body.
function RecentCallRow({ row: r }: { row: ToolCallSample }) {
  const [open, setOpen] = useState(false)
  const expandable = !!r.spanId && !!r.resultChars
  const { data: payload, isLoading } = useQuery({
    ...toolPayloadBodyQuery(r.spanId ?? ''),
    enabled: open && expandable,
  })
  return (
    <>
      <TableRow
        className={expandable ? 'cursor-pointer' : undefined}
        onClick={expandable ? () => setOpen((o) => !o) : undefined}
      >
        <TableCell>
          <Link
            to="."
            search={((prev: Record<string, unknown>) => ({ ...prev, trace: r.traceId })) as unknown as never}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {truncateId(r.traceId)}
          </Link>
        </TableCell>
        <TableCell>
          <RelativeTime ts={r.startedAtMs} className="tabular-nums text-muted-foreground" />
        </TableCell>
        <TableCell className="text-right tabular-nums">{formatDuration(r.durationMs)}</TableCell>
        <TableCell className="text-right tabular-nums">
          {r.resultChars ? (
            <span className="inline-flex items-center justify-end gap-1">
              <TokensFromChars chars={r.resultChars} />
              {expandable && (
                <ChevronDown
                  className={`size-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {r.hasError ? (
            <Badge variant="destructive" className="px-1 text-[10px]">
              Error
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={5} className="bg-muted/30 p-0">
            {isLoading ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Loading payload…</div>
            ) : !payload ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Payload unavailable.</div>
            ) : (
              <div className="space-y-1 px-3 py-2">
                <p className="text-[11px] text-muted-foreground">
                  {formatTokens(payload.tokens)} tokens
                  {payload.truncated && (
                    <span className="text-warning">
                      {' '}
                      · truncated by provider, showing first {payload.body.length.toLocaleString('en-US')} chars
                    </span>
                  )}
                </p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-foreground">
                  {payload.body}
                </pre>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
