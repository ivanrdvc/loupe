import { Link } from '@tanstack/react-router'
import { ChevronDown, Info } from 'lucide-react'
import { useState } from 'react'
import { RelativeTime } from '#/components/relative-time'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import type { InventoryRow } from '#/features/inbox'
import { formatPercent, formatTokens, tokensFromChars } from '#/lib/format'
import type { ToolErrorRow, ToolPayloadRow } from '#/lib/telemetry'
import { ACCENT, toolTone } from '#/lib/tone'
import { toolDisplayName } from '#/lib/tools'

const PREVIEW_ROWS = 5

export function Section({
  title,
  description,
  action,
  children,
  wide,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <Card className={wide ? 'xl:col-span-2' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {title}
          {description && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`About ${title}`}
                  className="cursor-help text-muted-foreground hover:text-foreground"
                >
                  <Info className="size-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent>{description}</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function SectionEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <Empty className="py-4">
      <EmptyHeader>
        <EmptyTitle className="text-xs">{title}</EmptyTitle>
        {description && <EmptyDescription className="text-xs">{description}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  )
}

export function Expandable<T>({ rows, children }: { rows: T[]; children: (visible: T[]) => React.ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const hasMore = rows.length > PREVIEW_ROWS
  const visible = expanded || !hasMore ? rows : rows.slice(0, PREVIEW_ROWS)
  return (
    <>
      {children(visible)}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
          {expanded ? 'Show less' : `Show more (${rows.length - PREVIEW_ROWS})`}
        </button>
      )}
    </>
  )
}

function rateTextTone(rate: number): string {
  if (rate >= 0.05) return 'text-destructive'
  if (rate > 0) return 'text-warning'
  return 'text-foreground'
}

function rateBarTone(rate: number): string {
  if (rate >= 0.05) return 'bg-destructive'
  if (rate > 0) return 'bg-warning'
  return 'bg-muted-foreground/40'
}

function sizeTextTone(tokens: number): string {
  if (tokens >= 2000) return 'text-destructive'
  if (tokens >= 500) return 'text-warning'
  return 'text-foreground'
}

// One tool metric row — the whole row drills into the tool's profile drawer.
function ToolStatRow({
  name,
  value,
  valueTone,
  meta,
  bar,
}: {
  name: string
  value: string
  valueTone: string
  meta: string
  bar?: { pct: number; tone: string }
}) {
  const display = toolDisplayName(name)
  const tone = toolTone('tool')
  return (
    <li>
      <Link
        to="."
        search={(prev) => ({ ...(prev as object), tool: display })}
        className="group flex flex-col gap-1 rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
      >
        <div className="flex items-center gap-2">
          <tone.icon className={`size-3.5 shrink-0 ${tone.text}`} aria-hidden />
          <span
            className={`min-w-0 flex-1 truncate font-mono text-xs font-medium ${ACCENT.violet.ident}`}
            title={display}
          >
            {display}
          </span>
          <span className={`shrink-0 text-sm font-semibold tabular-nums ${valueTone}`}>{value}</span>
        </div>
        <div className="flex items-center gap-3 pl-[1.375rem]">
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{meta}</span>
          {bar && (
            <span className="ml-auto h-1 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
              <span
                className={`block h-full rounded-full ${bar.tone}`}
                style={{ width: `${Math.max(2, Math.min(100, Math.round(bar.pct * 100)))}%` }}
              />
            </span>
          )}
        </div>
      </Link>
    </li>
  )
}

export function ToolErrorTable({ rows }: { rows: ToolErrorRow[] }) {
  if (rows.length === 0) {
    return <SectionEmpty title="No errored tool calls" description="Nothing failed in this window." />
  }
  return (
    <Expandable rows={rows}>
      {(visible) => (
        <ul className="-mx-2 flex flex-col">
          {visible.map((row) => (
            <ToolStatRow
              key={row.name}
              name={row.name}
              value={formatPercent(row.errorRate, 1)}
              valueTone={rateTextTone(row.errorRate)}
              meta={`${row.errors.toLocaleString()} / ${row.total.toLocaleString()} calls`}
              bar={{ pct: row.errorRate, tone: rateBarTone(row.errorRate) }}
            />
          ))}
        </ul>
      )}
    </Expandable>
  )
}

export function ToolPayloadTable({ rows }: { rows: ToolPayloadRow[] }) {
  if (rows.length === 0) {
    return <SectionEmpty title="No tool-call payloads" description="No execute_tool spans in this window." />
  }
  const maxP95 = Math.max(...rows.map((r) => r.p95Chars), 1)
  return (
    <Expandable rows={rows}>
      {(visible) => (
        <ul className="-mx-2 flex flex-col">
          {visible.map((row) => {
            const p95Tok = tokensFromChars(row.p95Chars)
            return (
              <ToolStatRow
                key={row.name}
                name={row.name}
                value={`${formatTokens(p95Tok)} tok`}
                valueTone={sizeTextTone(p95Tok)}
                meta={`avg ${formatTokens(tokensFromChars(row.avgChars))} · max ${formatTokens(tokensFromChars(row.maxChars))}`}
                bar={{ pct: row.p95Chars / maxP95, tone: 'bg-primary/60' }}
              />
            )
          })}
        </ul>
      )}
    </Expandable>
  )
}

export function NewToolsTable({ rows }: { rows: InventoryRow[] }) {
  if (rows.length === 0) {
    return <SectionEmpty title="No new MCP tools" description="Nothing newly observed in this window." />
  }
  const tone = toolTone('mcp')
  const visible = rows.slice(0, PREVIEW_ROWS)
  return (
    <ul className="-mx-2 flex flex-col">
      {visible.map((row) => (
        <li key={row.id}>
          <Link
            to="."
            search={(prev) => ({ ...(prev as object), tool: toolDisplayName(row.name) })}
            className="group flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
          >
            <tone.icon className={`size-3.5 shrink-0 ${tone.text}`} aria-hidden />
            <span
              className={`min-w-0 flex-1 truncate font-mono text-xs font-medium ${ACCENT.violet.ident}`}
              title={row.name}
            >
              {toolDisplayName(row.name)}
            </span>
            {row.namespace && (
              <span className="shrink-0 truncate text-[11px] text-muted-foreground" title={row.namespace}>
                {row.namespace}
              </span>
            )}
            <RelativeTime ts={row.firstSeenAtMs} className="shrink-0 text-[11px] tabular-nums text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function NewAgentsTable({ rows }: { rows: InventoryRow[] }) {
  if (rows.length === 0) {
    return <SectionEmpty title="No new agents" description="Nothing newly observed in this window." />
  }
  const tone = toolTone('agent')
  return (
    <Expandable rows={rows}>
      {(visible) => (
        <ul className="-mx-2 flex flex-col">
          {visible.map((row) => {
            const inner = (
              <>
                <tone.icon className={`size-3.5 shrink-0 ${tone.text}`} aria-hidden />
                <span
                  className={`min-w-0 flex-1 truncate font-mono text-xs font-medium ${ACCENT.emerald.ident}`}
                  title={row.name}
                >
                  {row.name}
                </span>
                <RelativeTime
                  ts={row.firstSeenAtMs}
                  className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                />
              </>
            )
            return (
              <li key={row.id}>
                {row.firstSeenTraceId ? (
                  <Link
                    to="."
                    search={(prev) => ({ ...(prev as object), trace: row.firstSeenTraceId ?? undefined })}
                    className="group flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/60"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 rounded-md px-2 py-2">{inner}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Expandable>
  )
}
