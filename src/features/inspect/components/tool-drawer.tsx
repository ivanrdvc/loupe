import { HugeiconsIcon } from '@hugeicons/react'
import { IconInfoCircle, IconX } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '#/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { formatDuration, formatPercent, formatTokens, tokensFromChars, truncateId } from '#/lib/format'
import type { ToolCallSample, ToolDetail } from '#/lib/telemetry'
import { toolDisplayName, toolTone } from '#/lib/tools'
import { toolDetailQuery, toolRecentCallsQuery } from './tool-data'

interface Props {
  toolName: string | null
  onClose: () => void
}

export function ToolInspectDrawer({ toolName, onClose }: Props) {
  const open = toolName !== null
  const name = toolName ?? ''
  const { data: detail, isLoading: detailLoading } = useQuery({
    ...toolDetailQuery(name),
    enabled: open,
  })
  const { data: recent, isLoading: recentLoading } = useQuery({
    ...toolRecentCallsQuery(name),
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
            <HugeiconsIcon
              icon={toolTone('tool').icon}
              strokeWidth={1.5}
              className={`size-4 shrink-0 ${toolTone('tool').text}`}
              aria-hidden
            />
            <SheetTitle className="truncate font-mono text-sm font-medium">{toolDisplayName(name)}</SheetTitle>
            <SheetDescription className="sr-only">Tool detail</SheetDescription>
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <IconX />
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

function StatsGrid({ detail, loading }: { detail: ToolDetail | null; loading: boolean }) {
  if (loading && !detail) {
    return <div className="px-4 py-6 text-xs text-muted-foreground">Loading…</div>
  }
  if (!detail) {
    return <div className="px-4 py-6 text-xs text-muted-foreground">No calls observed.</div>
  }
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-b px-4 py-4 sm:grid-cols-4">
      <Stat label="Calls" value={detail.calls.toLocaleString()} hint="Tool invocations in this window." />
      <Stat
        label="Errors"
        hint="Failed invocations. Target: < 1% error rate."
        value={
          <span className="flex items-baseline gap-1.5">
            <span className="tabular-nums">{detail.errors.toLocaleString()}</span>
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
        label="p95 tokens"
        hint="95th percentile result size. Target: < 2k tokens."
        value={<TokensFromChars chars={detail.p95Chars} />}
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
                <IconInfoCircle className="size-3" />
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

function TokensFromChars({ chars }: { chars: number }) {
  if (!chars) return <span className="text-muted-foreground">—</span>
  const tokens = tokensFromChars(chars)
  return (
    <span title={`${chars.toLocaleString()} chars · ≈${tokens.toLocaleString()} tokens`}>
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
              <TableHead className="w-12 text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.traceId}:${r.startedAtMs}`}>
                <TableCell>
                  <Link
                    to="."
                    search={((prev: Record<string, unknown>) => ({ ...prev, trace: r.traceId })) as unknown as never}
                    className="font-mono text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {truncateId(r.traceId)}
                  </Link>
                </TableCell>
                <TableCell>
                  <RelativeTime ts={r.startedAtMs} className="tabular-nums text-muted-foreground" />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatDuration(r.durationMs)}</TableCell>
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
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
