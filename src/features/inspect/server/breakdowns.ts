import { createServerFn } from '@tanstack/react-start'
import { breakdownChat, type SpanInput } from '#/features/inspect/logic/tokens'
import { ensureSession } from '#/lib/auth/guards'

export const fetchBreakdowns = createServerFn({ method: 'POST' })
  .inputValidator((spans: SpanInput[]) => spans)
  .handler(async ({ data }) => {
    await ensureSession()
    return Promise.all(data.map(breakdownChat))
  })
