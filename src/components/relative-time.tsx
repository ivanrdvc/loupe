import { useEffect, useState } from 'react'
import { formatAgo, formatRelative } from '#/lib/format'

interface Props extends Omit<React.TimeHTMLAttributes<HTMLTimeElement>, 'dateTime' | 'title' | 'children'> {
  ts: number
  variant?: 'ago' | 'relative'
}

export function RelativeTime({ ts, variant = 'ago', ...rest }: Props) {
  const iso = new Date(ts).toISOString()
  const [client, setClient] = useState<{ text: string; title: string } | null>(null)
  useEffect(() => {
    setClient({
      text: variant === 'relative' ? formatRelative(ts) : formatAgo(ts),
      title: new Date(ts).toLocaleString(),
    })
  }, [ts, variant])
  return (
    <time dateTime={iso} title={client?.title} {...rest}>
      {client?.text ?? iso.slice(0, 10)}
    </time>
  )
}
