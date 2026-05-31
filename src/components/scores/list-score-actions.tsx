import { StarIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Table } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { ReviewModeDialog, type ReviewQueueItem } from '#/components/scores/review-mode'
import { Button } from '#/components/ui/button'

type Props<T> = {
  table: Table<T>
  buildReviewItem: (row: T) => ReviewQueueItem
}

// Toolbar over a filtered trace/session list: opens the keyboard review queue.
export function ListScoreActions<T>({ table, buildReviewItem }: Props<T>) {
  const [reviewOpen, setReviewOpen] = useState(false)

  const filteredRows = table.getFilteredRowModel().rows
  const count = filteredRows.length
  const queueItems = useMemo(
    () => filteredRows.map((r) => buildReviewItem(r.original)),
    [filteredRows, buildReviewItem],
  )

  if (count === 0) return null

  return (
    <>
      <Button variant="outline" className="gap-x-1.5" onClick={() => setReviewOpen(true)}>
        <HugeiconsIcon icon={StarIcon} strokeWidth={2} className="size-4" />
        Review {count}
      </Button>
      <ReviewModeDialog open={reviewOpen} onOpenChange={setReviewOpen} items={queueItems} />
    </>
  )
}
