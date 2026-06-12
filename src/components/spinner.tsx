import { LoaderCircle } from 'lucide-react'
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
  return <LoaderCircle className={cn(SIZE_CLASS[size], 'animate-spin', className)} />
}
