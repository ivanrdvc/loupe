import { Add01Icon, Tag01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '#/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { createTag, listTags, setPromptTags } from '#/features/inventory/system-prompts/server'
import type { Tag } from '#/features/inventory/system-prompts/types'
import { errMessage } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import { TagChip } from './tag-chip'
import { nextTagColor, tagColorClass } from './tag-utils'

const tagsQueryOptions = {
  queryKey: queryKeys.prompts.tags(),
  queryFn: () => listTags(),
}

export function TagPicker({ promptId, selectedIds }: { promptId: number; selectedIds: number[] }) {
  const queryClient = useQueryClient()
  const { data: tags = [] } = useQuery(tagsQueryOptions)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selected = tags.filter((t) => selectedIdSet.has(t.id))

  const setTagsMutation = useMutation({
    mutationFn: (tagIds: number[]) => setPromptTags({ data: { promptId, tagIds } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.detail(promptId) })
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.list() })
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const createTagMutation = useMutation({
    mutationFn: (name: string) => createTag({ data: { name, color: nextTagColor(tags.map((t) => t.color)) } }),
    onSuccess: async (tag) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.prompts.tags() })
      setTagsMutation.mutate([...selectedIds, tag.id])
      setQuery('')
    },
    onError: (err) => toast.error(errMessage(err)),
  })

  const toggle = (tagId: number) => {
    const next = selectedIdSet.has(tagId) ? selectedIds.filter((id) => id !== tagId) : [...selectedIds, tagId]
    setTagsMutation.mutate(next)
  }

  const trimmed = query.trim()
  const lower = trimmed.toLowerCase()
  const exactExists = tags.some((t) => t.name.toLowerCase() === lower)

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {selected.map((tag) => (
        <TagChip key={tag.id} tag={tag} onRemove={() => toggle(tag.id)} />
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-5 gap-1 px-1.5 text-[11px] text-muted-foreground">
            <HugeiconsIcon icon={selected.length === 0 ? Tag01Icon : Add01Icon} strokeWidth={2} className="size-3" />
            {selected.length === 0 ? 'Add tags' : 'Add'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search or create tag…" value={query} onValueChange={setQuery} />
            <CommandList>
              <CommandGroup>
                {tags.map((tag) => {
                  const checked = selectedIdSet.has(tag.id)
                  return (
                    <CommandItem
                      key={tag.id}
                      value={tag.name}
                      onSelect={() => toggle(tag.id)}
                      className="flex items-center gap-2"
                    >
                      <span className={cn('size-3 rounded-full border', tagColorClass(tag.color))} />
                      <span className="flex-1">{tag.name}</span>
                      {checked && <span className="text-[10px] text-muted-foreground">selected</span>}
                    </CommandItem>
                  )
                })}
                {trimmed && !exactExists && (
                  <CommandItem
                    value={`__create__${trimmed}`}
                    onSelect={() => createTagMutation.mutate(trimmed)}
                    className="flex items-center gap-2 text-primary"
                  >
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={2} className="size-3" />
                    <span>
                      Create <span className="font-medium">{trimmed}</span>
                    </span>
                  </CommandItem>
                )}
                {tags.length === 0 && !trimmed && <CommandEmpty>Type to create a tag.</CommandEmpty>}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function TagChipRow({ tags, max = 3 }: { tags: Tag[]; max?: number }) {
  if (tags.length === 0) return null
  const visible = tags.slice(0, max)
  const overflow = tags.length - visible.length
  return (
    <div className="flex items-center gap-1">
      {visible.map((tag) => (
        <TagChip key={tag.id} tag={tag} />
      ))}
      {overflow > 0 && <span className="text-[10px] text-muted-foreground">+{overflow}</span>}
    </div>
  )
}
