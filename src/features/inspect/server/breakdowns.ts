import { createServerFn } from '@tanstack/react-start'
import { breakdownChat, type SpanInput } from '#/features/inspect/logic/tokens'

export const fetchBreakdowns = createServerFn({ method: 'POST' })
  .inputValidator((spans: SpanInput[]) => spans)
  .handler(async ({ data }) => {
    return Promise.all(data.map(breakdownChat))
  })
