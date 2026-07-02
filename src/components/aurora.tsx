import { type ComponentPropsWithoutRef, type CSSProperties, forwardRef, useEffect, useRef } from 'react'
import { cn } from '#/lib/utils'

export interface AuroraProps extends ComponentPropsWithoutRef<'div'> {
  /** Color blobs. Each {color, x, y, size} renders one radial gradient. */
  blobs?: Array<{ color: string; x: number; y: number; size?: number }>
  /** Blur amount in px. */
  blur?: number
  /** Disable the slow drift animation. */
  static?: boolean
  /** Lava-lamp mode: blobs drift, repel each other, and spring back home. */
  animated?: boolean
  /** When `animated`, how aggressively blobs push each other apart (0 disables). */
  repulsion?: number
}

const DEFAULT_BLOBS: NonNullable<AuroraProps['blobs']> = [
  { color: 'rgba(124,58,237,0.45)', x: 20, y: 30, size: 60 },
  { color: 'rgba(236,72,153,0.35)', x: 80, y: 25, size: 50 },
  { color: 'rgba(6,182,212,0.30)', x: 50, y: 80, size: 50 },
]

/** Drifting radial-gradient field. Renders inside a `position: relative` parent. */
export const Aurora = forwardRef<HTMLDivElement, AuroraProps>(
  (
    { blobs = DEFAULT_BLOBS, blur = 50, static: isStatic, animated, repulsion = 0.18, className, style, ...rest },
    ref,
  ) => {
    const blobRefs = useRef<Array<HTMLDivElement | null>>([])

    useEffect(() => {
      if (!animated) return
      const state = blobs.map((b) => ({
        x: b.x,
        y: b.y,
        homeX: b.x,
        homeY: b.y,
        size: b.size ?? 50,
        vx: (Math.random() - 0.5) * 0.06,
        vy: (Math.random() - 0.5) * 0.06,
      }))

      let raf = 0
      const tick = () => {
        for (let i = 0; i < state.length; i++) {
          const b = state[i]
          b.vx *= 0.965
          b.vy *= 0.965
          b.vx += (b.homeX - b.x) * 0.0009
          b.vy += (b.homeY - b.y) * 0.0009
          for (let j = 0; j < state.length; j++) {
            if (i === j) continue
            const o = state[j]
            const dx = b.x - o.x
            const dy = b.y - o.y
            const d = Math.hypot(dx, dy)
            const minDist = (b.size + o.size) * 0.4
            if (d < minDist && d > 0.001) {
              const force = ((minDist - d) / minDist) * repulsion
              b.vx += (dx / d) * force
              b.vy += (dy / d) * force
            }
          }
          b.vx += (Math.random() - 0.5) * 0.012
          b.vy += (Math.random() - 0.5) * 0.012
          b.x += b.vx
          b.y += b.vy
          const min = -10
          const max = 110
          if (b.x < min) {
            b.x = min
            b.vx = Math.abs(b.vx) * 0.6
          }
          if (b.x > max) {
            b.x = max
            b.vx = -Math.abs(b.vx) * 0.6
          }
          if (b.y < min) {
            b.y = min
            b.vy = Math.abs(b.vy) * 0.6
          }
          if (b.y > max) {
            b.y = max
            b.vy = -Math.abs(b.vy) * 0.6
          }
          const el = blobRefs.current[i]
          if (el) {
            el.style.left = `${b.x}%`
            el.style.top = `${b.y}%`
          }
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(raf)
    }, [animated, blobs, repulsion])

    const wrapper: CSSProperties = {
      position: 'absolute',
      inset: '-20%',
      zIndex: 0,
      pointerEvents: 'none',
      filter: `blur(${blur}px) saturate(140%)`,
      ...style,
    }

    return (
      <div
        ref={ref}
        aria-hidden="true"
        className={cn(!isStatic && !animated && 'animate-[aurora-drift_16s_ease-in-out_infinite_alternate]', className)}
        style={wrapper}
        {...rest}
      >
        {blobs.map((b, i) => {
          const size = b.size ?? 50
          return (
            <div
              key={`${b.color}-${b.x}-${b.y}`}
              ref={(el) => {
                blobRefs.current[i] = el
              }}
              style={{
                position: 'absolute',
                left: `${b.x}%`,
                top: `${b.y}%`,
                width: `${size}%`,
                height: `${size}%`,
                background: `radial-gradient(circle at center, ${b.color} 0%, transparent 70%)`,
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
                borderRadius: '50%',
              }}
            />
          )
        })}
      </div>
    )
  },
)
Aurora.displayName = 'Aurora'
