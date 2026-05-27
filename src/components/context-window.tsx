import { useCallback, useMemo, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { Progress } from '#/components/ui/progress'
import { useBreakdowns } from '#/hooks/use-breakdowns'
import { formatCost, formatPercent } from '#/lib/format'
import type { InspectorView } from '#/lib/inspector-view'
import type { Span } from '#/lib/spans'

interface ContextWindowProps {
  view: InspectorView
}

// Wrong values are worse than missing — return null when the model string
// doesn't match anything known.
function contextWindowFor(model: string | undefined): number | null {
  const m = (model ?? '').toLowerCase()
  if (!m) return null
  if (m.startsWith('claude')) return 200_000
  if (m.startsWith('gpt-4.1')) return 1_000_000
  if (m.startsWith('gpt-5')) return 400_000
  if (m.startsWith('gpt-4o') || m.startsWith('chatgpt-4o')) return 128_000
  if (m.startsWith('gpt-4-turbo') || m.startsWith('gpt-4-1106') || m.startsWith('gpt-4-0125')) return 128_000
  if (m.startsWith('gpt-4')) return 8_192
  if (m.startsWith('gpt-3.5')) return 16_385
  if (m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return 200_000
  if (m.startsWith('gemini-2') || m.startsWith('gemini-1.5')) return 1_000_000
  return null
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}K`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return n.toString()
}

export function ContextWindow({ view }: ContextWindowProps) {
  const chatSpans = view.allChats
  // Breakdown numbers only appear inside the popover panel — defer the fetch
  // until the user shows intent to open it (hover/focus/click on the trigger).
  const [primed, setPrimed] = useState(false)
  const prime = useCallback(() => setPrimed(true), [])
  const { ready, total } = useBreakdowns(chatSpans, { enabled: primed })

  // Peak input across turns — the most the model had to hold at once.
  const peakSpan = useMemo(() => {
    let max: Span | null = null
    for (const s of chatSpans) {
      if ((s.inputTokens ?? 0) > (max?.inputTokens ?? 0)) max = s
    }
    return max
  }, [chatSpans])

  const model = peakSpan?.model
  const limit = contextWindowFor(model)
  const peakInput = peakSpan?.inputTokens ?? 0
  const pct = limit ? Math.min(1, peakInput / limit) : 0

  const totalInput = useMemo(() => chatSpans.reduce((s, c) => s + (c.inputTokens ?? 0), 0), [chatSpans])
  const totalOutput = total.outputTokens || chatSpans.reduce((s, c) => s + (c.outputTokens ?? 0), 0)
  const totalCost = useMemo(() => chatSpans.reduce((s, c) => s + (c.costUsd ?? 0), 0), [chatSpans])

  if (chatSpans.length === 0) return null

  return (
    <Popover>
      <PopoverTrigger
        onMouseEnter={prime}
        onFocus={prime}
        onClick={prime}
        className="inline-flex h-7 items-center gap-2 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring/30"
        aria-label="Model context usage"
      >
        <span className="tabular-nums">{limit ? formatPercent(pct, 1) : formatTokens(peakInput)}</span>
        <Ring pct={pct} />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-64 p-0 text-xs">
        <div className="border-b px-3 py-2">
          <div className="flex items-baseline justify-between">
            <div className="font-medium tabular-nums text-foreground">
              {limit ? formatPercent(pct, 1) : formatTokens(peakInput)}
            </div>
            <div className="tabular-nums text-muted-foreground">
              {limit ? `${formatTokens(peakInput)} / ${formatTokens(limit)}` : `${formatTokens(peakInput)} peak`}
            </div>
          </div>
          {limit && <Progress value={pct * 100} className="mt-2" />}
          {model && <div className="mt-1.5 truncate text-[11px] text-muted-foreground">{model}</div>}
        </div>

        <dl className="space-y-1.5 px-3 py-2.5">
          <Row label="Input" value={formatTokens(totalInput)} dim={!ready} />
          <Row label="Output" value={formatTokens(totalOutput)} dim={!ready} />
          {total.cachedTokens > 0 && <Row label="Cached" value={formatTokens(total.cachedTokens)} dim={!ready} />}
        </dl>

        {totalCost > 0 && (
          <div className="flex items-center justify-between border-t px-3 py-2">
            <span className="text-muted-foreground">Total cost</span>
            <span className="font-medium tabular-nums text-foreground">{formatCost(totalCost)}</span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function Row({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={['tabular-nums text-foreground transition-opacity', dim ? 'opacity-40' : 'opacity-100'].join(' ')}>
        {value}
      </dd>
    </div>
  )
}

// Matches the AI Elements ring exactly — two concentric circles, the second
// stroked with a dasharray sized so dashoffset linearly maps usage to fill.
function Ring({ pct }: { pct: number }) {
  const r = 10
  const c = 2 * Math.PI * r
  const offset = c * (1 - pct)
  return (
    <svg
      aria-label="Model context usage"
      role="img"
      viewBox="0 0 24 24"
      width={20}
      height={20}
      style={{ color: 'currentcolor' }}
    >
      <title>{`${formatPercent(pct, 1)} of context used`}</title>
      <circle cx={12} cy={12} r={r} fill="none" opacity={0.25} stroke="currentColor" strokeWidth={2} />
      <circle
        cx={12}
        cy={12}
        r={r}
        fill="none"
        opacity={0.7}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center center' }}
      />
    </svg>
  )
}
