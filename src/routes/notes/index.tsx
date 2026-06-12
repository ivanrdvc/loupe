import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Check, ChevronDown, CircleCheck, Plus, StickyNote } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Page } from '#/components/page'
import { RelativeTime } from '#/components/relative-time'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
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
import { Dialog } from '#/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '#/components/ui/item'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import { Skeleton } from '#/components/ui/skeleton'
import { NoteDialogContent } from '#/features/notes'
import { listAllNotes } from '#/features/notes/server'
import type { Note, NoteStatus, NoteTargetKind } from '#/features/notes/types'
import { initialsFor } from '#/lib/current-user'
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'

const notesListQuery = () =>
  queryOptions({
    queryKey: queryKeys.notes.list(),
    queryFn: () => listAllNotes(),
  })

export const Route = createFileRoute('/notes/')({
  validateSearch: (search: Record<string, unknown>): { note?: number } => {
    const raw = typeof search.note === 'number' ? search.note : Number(search.note)
    return Number.isInteger(raw) && raw > 0 ? { note: raw } : {}
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(notesListQuery()),
  component: NotesPage,
})

const KIND_BADGE: Record<NoteTargetKind, 'default' | 'secondary' | 'outline'> = {
  session: 'secondary',
  trace: 'outline',
  span: 'secondary',
  prompt: 'default',
  experiment: 'outline',
}

const KIND_LABEL: Record<NoteTargetKind, string> = {
  session: 'Sessions',
  trace: 'Traces',
  span: 'Spans',
  prompt: 'Prompts',
  experiment: 'Experiments',
}

function previewBody(body: string): string {
  return body.replace(/[#*`>_[\]()]/g, '').slice(0, 160)
}

const STATUS_OPTIONS: { label: string; value: NoteStatus }[] = [
  { label: 'Open', value: 'open' },
  { label: 'Resolved', value: 'resolved' },
]

const KIND_OPTIONS: { label: string; value: NoteTargetKind }[] = (Object.keys(KIND_LABEL) as NoteTargetKind[]).map(
  (k) => ({ label: KIND_LABEL[k], value: k }),
)

function NotesPage() {
  const { data: notes = [], isLoading } = useQuery(notesListQuery())
  const { note: activeNoteId } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const [statusFilter, setStatusFilter] = useState<Set<NoteStatus>>(() => new Set())
  const [kindFilter, setKindFilter] = useState<Set<NoteTargetKind>>(() => new Set())

  const activeNote = useMemo(
    () => (activeNoteId != null ? (notes.find((n) => n.id === activeNoteId) ?? null) : null),
    [notes, activeNoteId],
  )
  const openNote = (id: number) => void navigate({ search: (prev) => ({ ...prev, note: id }) })
  const closeNote = () => void navigate({ search: (prev) => ({ ...prev, note: undefined }) })

  useEffect(() => {
    if (!isLoading && activeNoteId != null && activeNote == null) {
      void navigate({ search: (prev) => ({ ...prev, note: undefined }), replace: true })
    }
  }, [isLoading, activeNoteId, activeNote, navigate])

  const statusFacets = useMemo(() => {
    const m = new Map<NoteStatus, number>()
    for (const n of notes) m.set(n.status, (m.get(n.status) ?? 0) + 1)
    return m
  }, [notes])

  const kindFacets = useMemo(() => {
    const m = new Map<NoteTargetKind, number>()
    for (const n of notes) m.set(n.targetKind, (m.get(n.targetKind) ?? 0) + 1)
    return m
  }, [notes])

  const filtered = useMemo(() => {
    return notes.filter((n) => {
      if (statusFilter.size > 0 && !statusFilter.has(n.status)) return false
      if (kindFilter.size > 0 && !kindFilter.has(n.targetKind)) return false
      return true
    })
  }, [notes, statusFilter, kindFilter])

  const isFiltered = statusFilter.size > 0 || kindFilter.size > 0

  return (
    <Page title="Notes">
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <FilterFacet
            title="Status"
            options={STATUS_OPTIONS}
            selected={statusFilter}
            onChange={setStatusFilter}
            facets={statusFacets}
          />
          <FilterFacet
            title="Kind"
            options={KIND_OPTIONS}
            selected={kindFilter}
            onChange={setKindFilter}
            facets={kindFacets}
          />
          {isFiltered && (
            <Button
              variant="ghost"
              onClick={() => {
                setStatusFilter(new Set())
                setKindFilter(new Set())
              }}
              className="text-primary hover:text-primary"
            >
              Clear filters
            </Button>
          )}
        </div>

        {isLoading ? (
          <NotesListSkeleton />
        ) : filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <StickyNote />
              </EmptyMedia>
              <EmptyTitle>{notes.length === 0 ? 'No notes yet' : 'No matching notes'}</EmptyTitle>
              <EmptyDescription>
                {notes.length === 0 ? 'Open a session, trace, or prompt and add one.' : 'Adjust the filters above.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup>
            {filtered.map((note) => (
              <NoteCard key={note.id} note={note} onOpen={() => openNote(note.id)} />
            ))}
          </ItemGroup>
        )}
      </div>

      <Dialog open={activeNote != null} onOpenChange={(o) => !o && closeNote()}>
        <NoteDialogContent target={activeNote} />
      </Dialog>
    </Page>
  )
}

function NoteCard({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const navigate = useNavigate()
  const initials = initialsFor(note.author)
  const isResolved = note.status === 'resolved'

  const navigable =
    note.targetKind === 'session' ||
    note.targetKind === 'trace' ||
    note.targetKind === 'prompt' ||
    (note.targetKind === 'span' && (note.parentSessionId != null || note.parentTraceId != null))

  const openTarget = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (note.targetKind === 'session') {
      void navigate({
        to: '/sessions/$sessionId',
        params: { sessionId: note.targetId },
        search: { range: 7, view: 'conversation' },
      })
    } else if (note.targetKind === 'trace') {
      void navigate({ to: '/traces/$traceId', params: { traceId: note.targetId } })
    } else if (note.targetKind === 'prompt') {
      void navigate({ to: '/inventory/system-prompts/$promptId', params: { promptId: note.targetId } })
    } else if (note.targetKind === 'span') {
      if (note.parentSessionId) {
        void navigate({
          to: '/sessions/$sessionId',
          params: { sessionId: note.parentSessionId },
          search: { range: 7, view: 'spans', span: note.targetId },
        })
      } else if (note.parentTraceId) {
        void navigate({ to: '/traces/$traceId', params: { traceId: note.parentTraceId } })
      }
    }
  }

  return (
    <Item
      variant="outline"
      className={cn('cursor-pointer transition-colors hover:bg-muted/40', isResolved && 'opacity-70')}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <ItemMedia variant="icon">{isResolved ? <CircleCheck /> : <StickyNote />}</ItemMedia>
      <ItemContent>
        <ItemTitle className="gap-2">
          <Badge variant={KIND_BADGE[note.targetKind]} className="capitalize">
            {note.targetKind}
          </Badge>
          {isResolved && (
            <Badge variant="outline" className="text-muted-foreground">
              Resolved
            </Badge>
          )}
          <span className="truncate font-mono text-[11px] text-muted-foreground" title={note.targetId}>
            {note.targetId}
          </span>
        </ItemTitle>
        <ItemDescription>{previewBody(note.body) || '—'}</ItemDescription>
      </ItemContent>
      <ItemActions className="gap-3 text-xs text-muted-foreground">
        <RelativeTime ts={note.updatedAt} className="hidden tabular-nums sm:inline" />
        <Avatar size="sm" className="hidden sm:flex" title={note.author}>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        {navigable && (
          <Button size="sm" variant="ghost" onClick={openTarget}>
            Open
            <ArrowRight data-icon="inline-end" />
          </Button>
        )}
      </ItemActions>
    </Item>
  )
}

function FilterFacet<TValue extends string>({
  title,
  options,
  selected,
  onChange,
  facets,
}: {
  title: string
  options: { label: string; value: TValue }[]
  selected: Set<TValue>
  onChange: (next: Set<TValue>) => void
  facets?: Map<TValue, number>
}) {
  const hasSelection = selected.size > 0
  const selectedOptions = options.filter((o) => selected.has(o.value))

  const toggle = (value: TValue) => {
    const next = new Set(selected)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    onChange(next)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('gap-x-1.5 border-border', !hasSelection && 'border-dashed')}>
          <Plus
            className={cn('-ml-0.5 size-4 shrink-0 transition-transform', hasSelection && 'rotate-45')}
            aria-hidden="true"
          />
          <span>{title}</span>
          {hasSelection && (
            <>
              <span className="h-3.5 w-px bg-border" aria-hidden="true" />
              {selected.size > 2 ? (
                <span className="font-medium text-primary">{selected.size} selected</span>
              ) : (
                <span className="max-w-[10rem] truncate font-medium text-primary">
                  {selectedOptions.map((o) => o.label).join(', ')}
                </span>
              )}
            </>
          )}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder={title} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.has(option.value)
                return (
                  <CommandItem key={option.value} onSelect={() => toggle(option.value)}>
                    <div
                      className={cn(
                        'flex size-4 items-center justify-center rounded-[4px] border',
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input [&_svg]:invisible',
                      )}
                    >
                      <Check className="size-3" aria-hidden />
                    </div>
                    <span>{option.label}</span>
                    {facets?.get(option.value) ? (
                      <span className="ml-auto flex size-4 items-center justify-center font-mono text-xs text-muted-foreground">
                        {facets.get(option.value)}
                      </span>
                    ) : null}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {hasSelection && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange(new Set())} className="justify-center text-center">
                    Clear
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

function NotesListSkeleton() {
  return (
    <ItemGroup>
      {Array.from({ length: 4 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton items have no stable key
        <Item key={i} variant="outline">
          <ItemMedia variant="icon">
            <Skeleton className="size-4" />
          </ItemMedia>
          <ItemContent>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-72" />
          </ItemContent>
          <ItemActions>
            <Skeleton className="h-4 w-10" />
            <Skeleton className="size-6 rounded-full" />
          </ItemActions>
        </Item>
      ))}
    </ItemGroup>
  )
}
