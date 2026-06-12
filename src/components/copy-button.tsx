import { Check, Copy } from 'lucide-react'
import { useCopyToClipboard } from '#/hooks/use-copy-to-clipboard'

interface CopyButtonProps {
  value: string
  className?: string
  label?: string
}

export function CopyButton({ value, className, label = 'Copy' }: CopyButtonProps) {
  const { copied, copy } = useCopyToClipboard()

  const onClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await copy(value)
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
      {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
    </button>
  )
}
