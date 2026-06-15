import { LoaderCircle } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '#/lib/utils'

const SIZE_CLASS = {
  sm: 'size-3.5',
  md: 'size-4',
} as const

interface Props extends ComponentProps<typeof LoaderCircle> {
  size?: keyof typeof SIZE_CLASS
}

export function Spinner({ size = 'sm', className, ...props }: Props) {
  return <LoaderCircle className={cn(SIZE_CLASS[size], 'animate-spin', className)} {...props} />
}
