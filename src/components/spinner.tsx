import { Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '#/lib/utils'

const SIZE_CLASS = {
  sm: 'size-3.5',
  md: 'size-4',
} as const

interface Props {
  size?: keyof typeof SIZE_CLASS
  className?: string
}

export function Spinner({ size = 'sm', className }: Props) {
  return (
    <HugeiconsIcon icon={Loading03Icon} strokeWidth={2} className={cn(SIZE_CLASS[size], 'animate-spin', className)} />
  )
}
