import { ArrowRight02Icon, StickyNote01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Page } from '#/components/page'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '#/components/ui/item'
import { Skeleton } from '#/components/ui/skeleton'
import { initialsFor } from '#/lib/current-user'
import { formatAgo } from '#/lib/format'
import { queryKeys } from '#/lib/query-keys'
import { cn } from '#/lib/utils'
import { listAllNotes } from '#/server/notes'
import { NoteEditor } from './-components/note-editor'
import type { Note, NoteTargetKind } from './-types'

const notesListQuery = () =>
  queryOptions({
    queryKey: queryKeys.notes.list(),
    queryFn: () => listAllNotes(),
  })

export const Route = createFileRoute('/notes/')({
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

function previewBody(body: string): string {
  return body.replace(/[#*`>_[\]()]/g, '').slice(0, 160)
}

function NotesPage() {
  const { data: notes = [], isLoading } = useQuery(notesListQuery())
  const [expandedId, setExpandedId] = useState<number | null>(null)

  return (
    <Page title="Notes">
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        {isLoading ? (
          <NotesListSkeleton />
        ) : notes.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={StickyNote01Icon} />
              </EmptyMedia>
              <EmptyTitle>No notes yet</EmptyTitle>
              <EmptyDescription>Open a session, trace, or prompt and add one.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ItemGroup>
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                expanded={expandedId === note.id}
                onToggle={() => setExpandedId((prev) => (prev === note.id ? null : note.id))}
              />
            ))}
          </ItemGroup>
        )}
      </div>
    </Page>
  )
}

function NoteCard({ note, expanded, onToggle }: { note: Note; expanded: boolean; onToggle: () => void }) {
  const navigate = useNavigate()
  const initials = initialsFor(note.author)

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
      void navigate({ to: '/prompts/$promptId', params: { promptId: note.targetId } })
    } else if (note.targetKind === 'span') {
      if (note.parentSessionId) {
        void navigate({
          to: '/sessions/$sessionId',
          params: { sessionId: note.parentSessionId },
          search: { range: 7, view: 'spans', span: note.targetId },
        })
      } else if (note.parentTraceId) {
        // Provider resolves span-id-as-trace-id and sets focusSpanId.
        void navigate({ to: '/traces/$traceId', params: { traceId: note.targetId } })
      }
    }
  }

  return (
    <Item
      variant="outline"
      className={cn('cursor-pointer', expanded && 'bg-muted/30')}
      onClick={onToggle}
      aria-expanded={expanded}
    >
      <ItemMedia variant="icon">
        <HugeiconsIcon icon={StickyNote01Icon} strokeWidth={2} />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="gap-2">
          <Badge variant={KIND_BADGE[note.targetKind]} className="capitalize">
            {note.targetKind}
          </Badge>
          <span className="truncate font-mono text-[11px] text-muted-foreground" title={note.targetId}>
            {note.targetId}
          </span>
        </ItemTitle>
        <ItemDescription className={cn(expanded && 'line-clamp-none')}>{previewBody(note.body) || '—'}</ItemDescription>
      </ItemContent>
      <ItemActions className="gap-3 text-xs text-muted-foreground">
        <time
          dateTime={new Date(note.updatedAt).toISOString()}
          title={new Date(note.updatedAt).toLocaleString()}
          className="hidden tabular-nums sm:inline"
        >
          {formatAgo(note.updatedAt)}
        </time>
        <Avatar size="sm" className="hidden sm:flex" title={note.author}>
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        {navigable && (
          <Button size="sm" variant="ghost" onClick={openTarget}>
            Open
            <HugeiconsIcon icon={ArrowRight02Icon} strokeWidth={2} data-icon="inline-end" />
          </Button>
        )}
      </ItemActions>
      {expanded && (
        // biome-ignore lint/a11y/noStaticElementInteractions: stops bubble to row toggle; not itself interactive
        <div
          className="basis-full border-border border-t pt-3"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <NoteEditor targetKind={note.targetKind} targetId={note.targetId} compact />
        </div>
      )}
    </Item>
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
