import { CheckIcon, ClipboardIcon } from '@heroicons/react/16/solid'
import { useEffect, useRef, useState } from 'react'

interface CopyButtonProps {
  value: string
  className?: string
  label?: string
}

export function CopyButton({ value, className, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard unavailable (e.g. http://). Fail silently — nothing to recover.
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className={[
        'inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        className ?? '',
      ].join(' ')}
    >
      {copied ? <CheckIcon className="size-3" /> : <ClipboardIcon className="size-3" />}
    </button>
  )
}
