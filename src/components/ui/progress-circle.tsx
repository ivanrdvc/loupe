import type * as React from 'react'
import { cn } from '#/lib/utils'

interface ProgressCircleProps {
  value: number // 0–100
  radius?: number
  strokeWidth?: number
  className?: string // tone via text-* color; the arc uses stroke-current
  children?: React.ReactNode
}

// Tremor-style radial gauge: a muted track plus a foreground arc sized to `value`.
export function ProgressCircle({ value, radius = 14, strokeWidth = 3, className, children }: ProgressCircleProps) {
  const pct = Math.min(100, Math.max(0, value))
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference
  const size = (radius + strokeWidth) * 2
  const center = size / 2

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={center} cy={center} r={radius} strokeWidth={strokeWidth} fill="none" className="stroke-muted" />
        <circle
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn('stroke-current transition-all', className)}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  )
}
