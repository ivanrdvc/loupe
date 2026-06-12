'use client'

import { useAnimation } from 'motion/react'
import type { HTMLAttributes, ReactNode } from 'react'
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'

import { cn } from '#/lib/utils'

export interface AnimatedIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

export interface AnimatedIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

type AnimationControls = ReturnType<typeof useAnimation>

export function createAnimatedIcon(
  displayName: string,
  render: (controls: AnimationControls, size: number) => ReactNode,
) {
  const Icon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
    ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
      const controls = useAnimation()
      const isControlledRef = useRef(false)

      useImperativeHandle(ref, () => {
        isControlledRef.current = true

        return {
          startAnimation: () => controls.start('animate'),
          stopAnimation: () => controls.start('normal'),
        }
      })

      const handleMouseEnter = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
          if (isControlledRef.current) {
            onMouseEnter?.(e)
          } else {
            controls.start('animate')
          }
        },
        [controls, onMouseEnter],
      )

      const handleMouseLeave = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
          if (isControlledRef.current) {
            onMouseLeave?.(e)
          } else {
            controls.start('normal')
          }
        },
        [controls, onMouseLeave],
      )

      return (
        <div className={cn(className)} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} {...props}>
          {render(controls, size)}
        </div>
      )
    },
  )

  Icon.displayName = displayName

  return Icon
}
