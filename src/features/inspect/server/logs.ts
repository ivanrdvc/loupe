import { createServerFn } from '@tanstack/react-start'
import type { ListLogsOpts } from '#/lib/telemetry'
import { listSessionLogs as listSessionLogsImpl } from '#/lib/telemetry'

export const fetchSessionLogs = createServerFn({ method: 'POST' })
  .inputValidator((opts: ListLogsOpts) => opts)
  .handler(({ data }) => listSessionLogsImpl(data))
