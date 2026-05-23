import { useCallback, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { type SearchProvider, useRegisterSearchProvider } from '#/components/command-palette'
import { CommandShortcut } from '#/components/ui/command'
import { formatShortcut, useIsMac } from '#/hooks/use-is-mac'

export { formatShortcut, useIsMac } from '#/hooks/use-is-mac'

interface Options {
  entityId: string | null | undefined
  link?: string
  enabled?: boolean
}

export function useInspectShortcuts({ entityId, link, enabled = true }: Options) {
  const isMac = useIsMac()
  const id = entityId ?? ''
  const hasId = id.length > 0
  const hasLink = !!link

  const copyId = useCallback(async () => {
    if (!hasId) return
    try {
      await navigator.clipboard.writeText(id)
      toast.success('ID copied')
    } catch {
      toast.error('Could not copy')
    }
  }, [id, hasId])

  const copyLink = useCallback(async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy')
    }
  }, [link])

  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return
      const key = e.key.toLowerCase()
      if (key === 'y' && hasId) {
        e.preventDefault()
        void copyId()
      } else if (key === 'l' && hasLink) {
        e.preventDefault()
        void copyLink()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, hasId, hasLink, copyId, copyLink])

  const provider = useMemo<SearchProvider | null>(() => {
    if (!enabled || !hasId) return null
    const items: SearchProvider['items'] = [
      {
        id: 'copy-id',
        label: 'Copy ID',
        keywords: 'copy id session trace clipboard',
        trailing: <CommandShortcut>{formatShortcut(isMac, 'Y')}</CommandShortcut>,
        onSelect: copyId,
      },
    ]
    if (hasLink) {
      items.push({
        id: 'copy-link',
        label: 'Copy link',
        keywords: 'copy link share url',
        trailing: <CommandShortcut>{formatShortcut(isMac, 'L')}</CommandShortcut>,
        onSelect: copyLink,
      })
    }
    return { id: 'inspector', group: 'Inspect', items }
  }, [enabled, hasId, hasLink, isMac, copyId, copyLink])

  useRegisterSearchProvider(provider)

  return { isMac }
}
