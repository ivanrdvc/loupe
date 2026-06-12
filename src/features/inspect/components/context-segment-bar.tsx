import { useState } from 'react'
import { type ContextSegment, SEGMENT_COLORS } from './context-segments'
import { formatTokens } from './context-window'

export function ContextSegmentBar({
  segments,
  hoverable,
  showEmptyInLegend,
}: {
  segments: ContextSegment[]
  hoverable?: boolean
  showEmptyInLegend?: boolean
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const denom = segments.reduce((acc, s) => acc + s.tokens, 0) || 1

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((s) =>
          s.tokens > 0 ? (
            <div
              key={s.key}
              className={`${SEGMENT_COLORS[s.key]} transition-opacity duration-75`}
              style={{
                width: `${(s.tokens / denom) * 100}%`,
                ...(hoverable ? { opacity: hovered === null || hovered === s.key ? 1 : 0.3 } : {}),
              }}
            />
          ) : null,
        )}
      </div>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums">
        {segments.map((s) =>
          s.tokens > 0 || showEmptyInLegend ? (
            <li
              key={s.key}
              onMouseEnter={hoverable ? () => setHovered(s.key) : undefined}
              onMouseLeave={hoverable ? () => setHovered(null) : undefined}
              className={`inline-flex items-center gap-1.5 transition-opacity duration-75 ${
                hoverable ? 'cursor-default' : ''
              } ${hoverable && hovered !== null && hovered !== s.key ? 'opacity-40' : 'opacity-100'}`}
            >
              <span className={`size-1.5 rounded-full ${SEGMENT_COLORS[s.key]}`} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="text-foreground">{s.tokens ? formatTokens(s.tokens) : '—'}</span>
              {s.tokens > 0 && <span className="text-muted-foreground">· {s.pct}%</span>}
            </li>
          ) : null,
        )}
      </ul>
    </div>
  )
}
