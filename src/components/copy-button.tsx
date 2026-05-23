import { CheckIcon, ClipboardIcon } from '@heroicons/react/16/solid'
import { useState } from 'react'
import { Kbd } from '#/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'

interface CopyButtonProps {
  value: string
  className?: string
  label?: string
  shortcut?: string
}

export function CopyButton({ value, className, label = 'Copy', shortcut }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard unavailable (e.g. http://). Fail silently — nothing to recover.
    }
  }

  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-label={copied ? 'Copied' : label}
      title={shortcut ? undefined : copied ? 'Copied' : label}
      className={[
        'inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        className ?? '',
      ].join(' ')}
    >
      {copied ? <CheckIcon className="size-3" /> : <ClipboardIcon className="size-3" />}
    </button>
  )

  if (!shortcut) return button

  return (
    <Tooltip open={copied || undefined}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent className="flex items-center gap-2">
        <span>{copied ? 'Copied' : label}</span>
        {!copied && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
}
