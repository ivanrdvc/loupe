import { useCallback, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { type SearchProvider, useRegisterSearchProvider } from '#/components/command-palette'
import { CommandShortcut } from '#/components/ui/command'
import { useCopyToClipboard } from '#/hooks/use-copy-to-clipboard'
import { formatShortcut, useIsMac } from '#/hooks/use-is-mac'

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
  const { copy } = useCopyToClipboard()

  const copyId = useCallback(async () => {
    if (!hasId) return
    const ok = await copy(id)
    if (ok) toast.success('ID copied')
    else toast.error('Could not copy')
  }, [id, hasId, copy])

  const copyLink = useCallback(async () => {
    if (!link) return
    const ok = await copy(link)
    if (ok) toast.success('Link copied')
    else toast.error('Could not copy')
  }, [link, copy])

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
