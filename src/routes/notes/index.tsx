import { ArrowDown01Icon, ArrowRight01Icon, ArrowRight02Icon, StickyNote01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Page } from '#/components/page'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '#/components/ui/empty'
import { Skeleton } from '#/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
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
  return body.replace(/[#*`>_[\]()]/g, '').slice(0, 120)
}

function truncateTargetId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 14)}…` : id
}

function NotesPage() {
  const { data: notes = [], isLoading } = useQuery(notesListQuery())
  const [expandedId, setExpandedId] = useState<number | null>(null)

  return (
    <Page title="Notes">
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <h1 className="text-lg font-semibold">Notes</h1>

        {isLoading ? (
          <NotesTableSkeleton />
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
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow>
                  <TableHead className="w-[2.5rem]" />
                  <TableHead className="w-[14rem]">Target</TableHead>
                  <TableHead>Preview</TableHead>
                  <TableHead className="w-[12rem]">Author</TableHead>
                  <TableHead className="w-[8rem] text-right">Updated</TableHead>
                  <TableHead className="w-[10rem]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {notes.map((note) => (
                  <NoteRow
                    key={note.id}
                    note={note}
                    expanded={expandedId === note.id}
                    onToggle={() => setExpandedId((prev) => (prev === note.id ? null : note.id))}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Page>
  )
}

function NoteRow({ note, expanded, onToggle }: { note: Note; expanded: boolean; onToggle: () => void }) {
  const navigate = useNavigate()
  const isSpan = note.targetKind === 'span'
  const isExperiment = note.targetKind === 'experiment'
  const navigable = !isSpan && !isExperiment
  const initials = initialsFor(note.author)

  const openTarget = () => {
    if (!navigable) return
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
    }
  }

  const openTargetButton = (
    <Button
      size="sm"
      variant="ghost"
      onClick={(e) => {
        e.stopPropagation()
        openTarget()
      }}
      disabled={!navigable}
    >
      Open target
      <HugeiconsIcon icon={ArrowRight02Icon} strokeWidth={2} data-icon="inline-end" />
    </Button>
  )

  return (
    <>
      <TableRow className={cn('cursor-pointer', expanded && 'bg-muted/30')} onClick={onToggle} aria-expanded={expanded}>
        <TableCell>
          <Button
            size="sm"
            variant="ghost"
            className="size-7 p-0"
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            aria-label={expanded ? 'Collapse note' : 'Expand note'}
          >
            <HugeiconsIcon icon={expanded ? ArrowDown01Icon : ArrowRight01Icon} strokeWidth={2} className="size-3.5" />
          </Button>
        </TableCell>
        <TableCell>
          <div className="flex min-w-0 items-center gap-2">
            <Badge variant={KIND_BADGE[note.targetKind]} className="shrink-0 capitalize">
              {note.targetKind}
            </Badge>
            <span className="truncate font-mono text-[11px] text-muted-foreground" title={note.targetId}>
              {truncateTargetId(note.targetId)}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <span className="block max-w-[640px] truncate text-muted-foreground">{previewBody(note.body) || '—'}</span>
        </TableCell>
        <TableCell>
          <div className="flex min-w-0 items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="truncate text-muted-foreground">{note.author}</span>
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">
          <time dateTime={new Date(note.updatedAt).toISOString()} title={new Date(note.updatedAt).toLocaleString()}>
            {formatAgo(note.updatedAt)}
          </time>
        </TableCell>
        <TableCell className="text-right">
          {navigable ? (
            openTargetButton
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>{openTargetButton}</span>
              </TooltipTrigger>
              <TooltipContent>
                {isSpan
                  ? 'Span notes are visible in the session inspect drawer.'
                  : 'Experiment view is not available yet.'}
              </TooltipContent>
            </Tooltip>
          )}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={6} className="py-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Editing note</span>
                {navigable ? openTargetButton : null}
              </div>
              <NoteEditor targetKind={note.targetKind} targetId={note.targetId} />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function NotesTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow>
            <TableHead className="w-[2.5rem]" />
            <TableHead className="w-[14rem]">Target</TableHead>
            <TableHead>Preview</TableHead>
            <TableHead className="w-[12rem]">Author</TableHead>
            <TableHead className="w-[8rem] text-right">Updated</TableHead>
            <TableHead className="w-[10rem]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 3 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows have no stable key
            <TableRow key={i}>
              <TableCell>
                <Skeleton className="size-5" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-full max-w-md" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-6 w-24" />
              </TableCell>
              <TableCell>
                <Skeleton className="ml-auto h-4 w-12" />
              </TableCell>
              <TableCell>
                <Skeleton className="ml-auto h-7 w-24" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
