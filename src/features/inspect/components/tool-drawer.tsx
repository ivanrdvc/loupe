import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, ChevronsUpDown, Info, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { RelativeTime } from '#/components/relative-time'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { ScrollArea } from '#/components/ui/scroll-area'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from '#/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { useTimeRange } from '#/hooks/use-time-range'
import { formatDuration, formatPercent, formatTokens, payloadSeverity, truncateId } from '#/lib/format'
import type { ToolCallSample, ToolRow } from '#/lib/telemetry'
import { ACCENT, toolTone } from '#/lib/tone'
import { toolDisplayName } from '#/lib/tools'
import { toolDetailQuery, toolRecentCallsQuery } from './tool-data'
import { ToolPayloadTrend } from './tool-payload-trend'

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
          <ToolPayloadTrend name={name} open={open} />
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
        hint="95th percentile result size, estimated from result length (chars÷4) over the window. Red when one result nears the model context window. Recent calls below show exact counts."
        value={<Tokens tokens={detail.p95TokensEst} severity estimate />}
      />
      <Stat
        label="max result"
        hint={
          detail.maxTokensEst
            ? 'Largest result in this window, estimated because the provider did not retain enough data for an exact token count.'
            : 'Largest single result in this window. Every captured result body was tokenized and compared.'
        }
        value={<Tokens tokens={detail.maxTokens} severity estimate={detail.maxTokensEst} />}
      />
      <Stat
        label="total returned"
        hint="Sum of all results over the window (estimated chars÷4) — total context this tool burned."
        value={<Tokens tokens={detail.totalTokensEst} estimate />}
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

export function Tokens({ tokens, severity, estimate }: { tokens: number; severity?: boolean; estimate?: boolean }) {
  if (!tokens) return <span className="text-muted-foreground">—</span>
  const s = severity ? payloadSeverity(tokens) : 'ok'
  const tone = s === 'danger' ? 'text-destructive' : s === 'warn' ? 'text-warning' : ''
  return (
    <span className={tone} title={estimate ? 'Estimated from result length (chars÷4)' : undefined}>
      {estimate ? '≈' : ''}
      {formatTokens(tokens)}
      <span className="text-muted-foreground"> tok</span>
    </span>
  )
}

type RecentSortKey = 'time' | 'duration' | 'size'

const recentSortValue: Record<RecentSortKey, (r: ToolCallSample) => number> = {
  time: (r) => r.startedAtMs,
  duration: (r) => r.durationMs,
  size: (r) => r.resultTokens ?? 0,
}

function RecentCallsSection({ rows, loading }: { rows: ToolCallSample[]; loading: boolean }) {
  const [sort, setSort] = useState<{ key: RecentSortKey; desc: boolean }>({ key: 'time', desc: true })
  const sorted = useMemo(() => {
    const value = recentSortValue[sort.key]
    return [...rows].sort((a, b) => (sort.desc ? value(b) - value(a) : value(a) - value(b)))
  }, [rows, sort])
  const toggle = (key: RecentSortKey) => setSort((prev) => ({ key, desc: prev.key === key ? !prev.desc : true }))

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
              <SortHead label="When" active={sort} sortKey="time" onClick={toggle} />
              <SortHead label="Duration" active={sort} sortKey="duration" onClick={toggle} align="right" />
              <SortHead label="Size" active={sort} sortKey="size" onClick={toggle} align="right" />
              <TableHead className="w-12 text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r, i) => (
              <RecentCallRow key={r.spanId ?? `${r.traceId}:${r.startedAtMs}:${i}`} row={r} />
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  )
}

function SortHead({
  label,
  sortKey,
  active,
  onClick,
  align,
}: {
  label: string
  sortKey: RecentSortKey
  active: { key: RecentSortKey; desc: boolean }
  onClick: (key: RecentSortKey) => void
  align?: 'right'
}) {
  const isActive = active.key === sortKey
  const Icon = !isActive ? ChevronsUpDown : active.desc ? ArrowDown : ArrowUp
  return (
    <TableHead className={align === 'right' ? 'text-right tabular-nums' : undefined}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''} ${isActive ? 'text-foreground' : ''}`}
      >
        <span>{label}</span>
        <Icon className="size-3 text-muted-foreground" aria-hidden />
      </button>
    </TableHead>
  )
}

function RecentCallRow({ row: r }: { row: ToolCallSample }) {
  return (
    <TableRow>
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
      <TableCell className="text-right tabular-nums">
        {r.resultTokens ? (
          <span title={r.resultChars ? `${r.resultChars.toLocaleString('en-US')} characters` : undefined}>
            {formatTokens(r.resultTokens)}
            <span className="text-muted-foreground"> tok</span>
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
  )
}
