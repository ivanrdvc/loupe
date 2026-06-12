import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Database } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '#/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import type { ExampleInput } from '#/features/evaluation/dataset-types'
import { createDataset, listDatasets, upsertExample } from '#/features/evaluation/server/datasets'
import { errMessage } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'

export type DatasetItemDraft = {
  input: ExampleInput
  expected?: string | null
  sourceTraceId?: string | null
  sourceSpanId?: string | null
}

// Captures question + golden expected into a dataset in one gesture.
export function AddToDatasetButton({
  items,
  label = 'Add to dataset',
  size = 'sm',
  variant = 'outline',
}: {
  items: DatasetItemDraft[] | (() => DatasetItemDraft[])
  label?: string
  size?: 'sm' | 'default'
  variant?: 'outline' | 'ghost' | 'secondary'
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const queryClient = useQueryClient()
  const { data: datasets } = useQuery({
    queryKey: queryKeys.datasets.list(),
    queryFn: () => listDatasets(),
    enabled: open,
  })

  const resolveItems = () => (typeof items === 'function' ? items() : items)

  const addItems = async (datasetId: string) => {
    const drafts = resolveItems()
    for (const it of drafts) {
      await upsertExample({ data: { ...it, datasetId } })
    }
    return drafts.length
  }

  const addMutation = useMutation({
    mutationFn: (datasetId: string) => addItems(datasetId),
    onSuccess: async (added) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.datasets.all() })
      toast.success(`Added ${added} item${added === 1 ? '' : 's'} to dataset`)
      setOpen(false)
      setQuery('')
    },
    onError: (e) => toast.error(errMessage(e)),
  })

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const ds = await createDataset({ data: { name } })
      await addItems(ds.id)
      return ds
    },
    onSuccess: async (ds) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.datasets.all() })
      toast.success(`Created "${ds.name}" and added items`)
      setOpen(false)
      setQuery('')
    },
    onError: (e) => toast.error(errMessage(e)),
  })

  const pending = addMutation.isPending || createMutation.isPending
  const trimmed = query.trim()
  const exactMatch = datasets?.some((d) => d.name.toLowerCase() === trimmed.toLowerCase())

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size={size} variant={variant}>
          <Database data-icon="inline-start" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder="Find or create dataset…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No datasets yet.</CommandEmpty>
            {datasets && datasets.length > 0 && (
              <CommandGroup heading="Datasets">
                {datasets.map((d) => (
                  <CommandItem key={d.id} value={d.name} onSelect={() => !pending && addMutation.mutate(d.id)}>
                    <span className="truncate">{d.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{d.exampleCount}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {trimmed && !exactMatch && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value={`__create__${trimmed}`}
                    onSelect={() => !pending && createMutation.mutate(trimmed)}
                  >
                    Create “{trimmed}”
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
