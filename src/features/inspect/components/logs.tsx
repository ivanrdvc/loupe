import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { Spinner } from '#/components/spinner'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '#/components/ui/input-group'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { fetchSessionLogs } from '#/features/inspect/server/logs'
import { formatJson } from '#/lib/json'
import { queryKeys } from '#/lib/query-keys'
import type { Span } from '#/lib/spans'
import type { LogLevel, LogRecord } from '#/lib/telemetry/types'

const LEVEL_VARIANT: Record<LogLevel, 'outline' | 'secondary' | 'warning' | 'destructive'> = {
  trace: 'outline',
  debug: 'outline',
  info: 'secondary',
  warn: 'warning',
  error: 'destructive',
  fatal: 'destructive',
}

export function SessionLogsPanel({ spans, enabled }: { spans: Span[]; enabled: boolean }) {
  const traceIds = useMemo(() => [...new Set(spans.map((s) => s.traceId).filter(Boolean))].sort(), [spans])
  const window = useMemo(() => {
    if (spans.length === 0) return undefined
    let from = spans[0].startMs
    let to = spans[0].endMs
    for (const s of spans) {
      if (s.startMs < from) from = s.startMs
      if (s.endMs > to) to = s.endMs
    }
    return { fromUs: from * 1000, toUs: to * 1000 }
  }, [spans])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.logs.byTraceIds(traceIds),
    queryFn: () => fetchSessionLogs({ data: { traceIds, ...window } }),
    enabled: enabled && traceIds.length > 0,
    staleTime: 30_000,
  })

  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const logs = data?.logs ?? []
    const q = query.trim().toLowerCase()
    if (!q) return logs
    return logs.filter(
      (l) =>
        l.message.toLowerCase().includes(q) || l.source?.toLowerCase().includes(q) || l.level.toLowerCase().includes(q),
    )
  }, [data?.logs, query])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center px-4 py-12 text-xs text-muted-foreground/70">
        <Spinner />
      </div>
    )
  }

  if (isError) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>Failed to load logs</EmptyTitle>
          <EmptyDescription>{error instanceof Error ? error.message : 'Provider query failed.'}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (data === null) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>Logs not supported</EmptyTitle>
          <EmptyDescription>The active telemetry provider doesn't expose a logs query.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const logs = data?.logs ?? []

  if (logs.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>No logs</EmptyTitle>
          <EmptyDescription>
            None of this session's traces ({traceIds.length || 0}) carried log records.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-2">
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter logs…" />
        </InputGroup>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {filtered.length === logs.length ? logs.length : `${filtered.length} / ${logs.length}`}
        </Badge>
      </div>

      {filtered.length === 0 ? (
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription>No log records match “{query}”.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[7rem] font-mono text-[11px] uppercase tracking-wide">Time</TableHead>
                <TableHead className="w-[5rem] font-mono text-[11px] uppercase tracking-wide">Level</TableHead>
                <TableHead className="w-[9rem] font-mono text-[11px] uppercase tracking-wide">Source</TableHead>
                <TableHead className="font-mono text-[11px] uppercase tracking-wide">Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((log, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: id collides when two lines share a ms; frozen ordered list
                <LogRow key={`${log.id}-${i}`} log={log} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function LogRow({ log }: { log: LogRecord }) {
  const [expanded, setExpanded] = useState(false)
  const hasAttributes = !!log.attributes && Object.keys(log.attributes).length > 0
  return (
    <Fragment>
      <TableRow className="align-top">
        <TableCell className="py-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
          {formatLogTime(log.timestampMs)}
        </TableCell>
        <TableCell className="py-1.5">
          <Badge variant={LEVEL_VARIANT[log.level]} className="font-mono text-[10px] uppercase">
            {log.level}
          </Badge>
        </TableCell>
        <TableCell className="py-1.5 font-mono text-[11px] text-muted-foreground">
          <span className="block truncate" title={log.source}>
            {log.source ?? '—'}
          </span>
        </TableCell>
        <TableCell className="w-full max-w-0 whitespace-normal py-1.5 font-mono text-[11px] text-foreground">
          <div className="flex items-start gap-1.5">
            <span className="min-w-0 flex-1 break-words">{log.message || '(no message)'}</span>
            {hasAttributes && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-expanded={expanded}
                onClick={() => setExpanded((x) => !x)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                {expanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {expanded && hasAttributes && (
        <TableRow>
          <TableCell colSpan={4} className="bg-muted/30 p-2">
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
              {formatJson(log.attributes ?? {})}
            </pre>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  )
}

function formatLogTime(ms: number): string {
  const d = new Date(ms)
  return `${d.toLocaleTimeString(undefined, { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`
}
